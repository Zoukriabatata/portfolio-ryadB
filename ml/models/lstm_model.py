"""
LSTM Sequence Model
────────────────────────────────────────────────────────────────────────────
WHY LSTM for this problem:
  1. Options market signals have temporal memory:
     - GEX evolution over time (gamma wall approach/breakdown)
     - Skew trending (sentiment building over days)
     - Flow clustering (Hawkes-like self-excitation in the feature space)
  2. The LSTM learns WHEN a given GEX/skew combination is transitional
     vs. stable — something tabular models can't capture.
  3. Sequence length of ~20 bars captures intraday patterns (open, lunch,
     close) or multi-day momentum.

ARCHITECTURE:
  - Input:  (batch, seq_len, n_features)
  - LSTM layers (bidirectional for lookback only — no future leakage)
    Actually: unidirectional LSTM to preserve causality
  - Dropout for regularization
  - FC head for multi-class output (SHORT/NEUTRAL/LONG)

TRAINING NOTES:
  - Walk-forward only: train on T, validate on T+1 window
  - Use gradient clipping (norm=1.0) — LSTM is sensitive to exploding gradients
  - Early stopping on validation loss
"""

import numpy as np
import pandas as pd
from typing import Optional, Tuple

try:
    import torch
    import torch.nn as nn
    from torch.utils.data import Dataset, DataLoader
    HAS_TORCH = True
except ImportError:
    HAS_TORCH = False
    print("[WARN] PyTorch not installed. Run: pip install torch")


# ─── Dataset ─────────────────────────────────────────────────────────────────

class SequenceDataset(Dataset):
    """
    Sliding window dataset for LSTM training.
    Each sample: (seq_len, n_features) → label
    No look-ahead: label at position i is from i + lookahead bars.
    """

    def __init__(
        self,
        features:    np.ndarray,    # shape (T, n_features)
        labels:      np.ndarray,    # shape (T,) — encoded as 0/1/2
        seq_len:     int = 20,
    ):
        self.X       = features
        self.y       = labels
        self.seq_len = seq_len

    def __len__(self) -> int:
        return max(0, len(self.X) - self.seq_len)

    def __getitem__(self, idx: int) -> Tuple:
        x = self.X[idx : idx + self.seq_len]
        y = self.y[idx + self.seq_len - 1]     # label at end of sequence
        return (
            torch.tensor(x, dtype=torch.float32),
            torch.tensor(y, dtype=torch.long),
        )


# ─── Model architecture ──────────────────────────────────────────────────────

class LSTMRegimeModel(nn.Module):
    """
    Stacked LSTM with attention-like final step extraction.

    Architecture:
        Input → LayerNorm → LSTM(×2) → Dropout → FC(128) → ReLU → FC(3)

    LayerNorm on input stabilizes training with heterogeneous features
    (spread, GEX, skew all have very different scales).
    """

    def __init__(
        self,
        n_features:   int,
        hidden_size:  int   = 128,
        num_layers:   int   = 2,
        dropout:      float = 0.3,
        num_classes:  int   = 3,
    ):
        super().__init__()

        self.input_norm = nn.LayerNorm(n_features)

        self.lstm = nn.LSTM(
            input_size   = n_features,
            hidden_size  = hidden_size,
            num_layers   = num_layers,
            batch_first  = True,
            dropout      = dropout if num_layers > 1 else 0.0,
        )

        self.head = nn.Sequential(
            nn.Dropout(dropout),
            nn.Linear(hidden_size, 64),
            nn.ReLU(),
            nn.Linear(64, num_classes),
        )

    def forward(self, x: 'torch.Tensor') -> 'torch.Tensor':
        # x: (batch, seq_len, n_features)
        x_norm = self.input_norm(x)
        out, _ = self.lstm(x_norm)      # out: (batch, seq_len, hidden_size)
        last    = out[:, -1, :]         # take last timestep representation
        return self.head(last)          # (batch, num_classes)


# ─── Trainer ─────────────────────────────────────────────────────────────────

class LSTMTrainer:
    """
    Training wrapper for LSTMRegimeModel.
    Handles: batching, gradient clipping, early stopping, checkpointing.
    """

    def __init__(
        self,
        n_features:   int,
        seq_len:      int   = 20,
        hidden_size:  int   = 128,
        num_layers:   int   = 2,
        dropout:      float = 0.3,
        lr:           float = 1e-3,
        batch_size:   int   = 64,
        max_epochs:   int   = 100,
        patience:     int   = 10,
        device:       str   = 'cpu',
    ):
        if not HAS_TORCH:
            raise ImportError("pip install torch")

        self.seq_len    = seq_len
        self.batch_size = batch_size
        self.max_epochs = max_epochs
        self.patience   = patience
        self.device     = torch.device(device)

        self.model = LSTMRegimeModel(
            n_features, hidden_size, num_layers, dropout
        ).to(self.device)

        self.optimizer  = torch.optim.Adam(self.model.parameters(), lr=lr)
        self.scheduler  = torch.optim.lr_scheduler.ReduceLROnPlateau(
            self.optimizer, factor=0.5, patience=5, min_lr=1e-5
        )
        self.criterion  = nn.CrossEntropyLoss()
        self.is_fitted  = False

    def fit(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val:   Optional[np.ndarray] = None,
        y_val:   Optional[np.ndarray] = None,
    ) -> dict:
        """
        Train with early stopping.
        Returns training history dict.
        """
        train_ds = SequenceDataset(X_train, y_train, self.seq_len)
        train_dl = DataLoader(train_ds, batch_size=self.batch_size, shuffle=True)

        val_dl = None
        if X_val is not None and y_val is not None:
            val_ds = SequenceDataset(X_val, y_val, self.seq_len)
            val_dl = DataLoader(val_ds, batch_size=self.batch_size, shuffle=False)

        history   = {'train_loss': [], 'val_loss': []}
        best_val  = float('inf')
        no_improve = 0
        best_state = None

        for epoch in range(self.max_epochs):
            # ── Train ────────────────────────────────────────────────────────
            self.model.train()
            train_loss = self._run_epoch(train_dl, train=True)
            history['train_loss'].append(train_loss)

            # ── Validate ─────────────────────────────────────────────────────
            if val_dl is not None:
                self.model.eval()
                with torch.no_grad():
                    val_loss = self._run_epoch(val_dl, train=False)
                history['val_loss'].append(val_loss)
                self.scheduler.step(val_loss)

                if val_loss < best_val - 1e-4:
                    best_val   = val_loss
                    no_improve = 0
                    best_state = {k: v.clone() for k, v in self.model.state_dict().items()}
                else:
                    no_improve += 1
                    if no_improve >= self.patience:
                        print(f"  Early stopping at epoch {epoch+1}")
                        break

        # Restore best weights
        if best_state is not None:
            self.model.load_state_dict(best_state)

        self.is_fitted = True
        return history

    def _run_epoch(self, loader: 'DataLoader', train: bool) -> float:
        total_loss = 0.0
        for X_batch, y_batch in loader:
            X_batch = X_batch.to(self.device)
            y_batch = y_batch.to(self.device)

            if train:
                self.optimizer.zero_grad()

            logits = self.model(X_batch)
            loss   = self.criterion(logits, y_batch)

            if train:
                loss.backward()
                nn.utils.clip_grad_norm_(self.model.parameters(), 1.0)
                self.optimizer.step()

            total_loss += loss.item() * len(X_batch)

        return total_loss / max(len(loader.dataset), 1)

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        """
        Returns class probabilities [P(SHORT), P(NEUTRAL), P(LONG)].
        Shape: (n_samples - seq_len, 3)
        """
        if not self.is_fitted:
            raise RuntimeError("Model not fitted.")

        dummy_y = np.zeros(len(X))
        ds      = SequenceDataset(X, dummy_y, self.seq_len)
        dl      = DataLoader(ds, batch_size=256, shuffle=False)

        all_probs = []
        self.model.eval()
        with torch.no_grad():
            for X_batch, _ in dl:
                logits = self.model(X_batch.to(self.device))
                probs  = torch.softmax(logits, dim=-1).cpu().numpy()
                all_probs.append(probs)

        return np.concatenate(all_probs, axis=0)

    def predict(self, X: np.ndarray) -> np.ndarray:
        proba = self.predict_proba(X)
        # Decode: 0=SHORT(-1), 1=NEUTRAL(0), 2=LONG(+1)
        encoded = proba.argmax(axis=1)
        decode  = {0: -1, 1: 0, 2: 1}
        return np.array([decode[e] for e in encoded])

    def save(self, path: str) -> None:
        import os
        os.makedirs(os.path.dirname(path), exist_ok=True)
        torch.save({
            'model_state': self.model.state_dict(),
            'model_config': {
                'n_features':  self.model.input_norm.normalized_shape[0],
                'hidden_size': self.model.lstm.hidden_size,
                'num_layers':  self.model.lstm.num_layers,
                'seq_len':     self.seq_len,
            },
        }, path)

    def load(self, path: str) -> 'LSTMTrainer':
        ckpt   = torch.load(path, map_location=self.device)
        config = ckpt['model_config']
        self.seq_len = config['seq_len']
        self.model = LSTMRegimeModel(
            config['n_features'], config['hidden_size'], config['num_layers']
        ).to(self.device)
        self.model.load_state_dict(ckpt['model_state'])
        self.is_fitted = True
        return self
