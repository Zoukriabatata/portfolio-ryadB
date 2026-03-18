"""
Signal Logger — Persist engine signals to CSV for later evaluation.
────────────────────────────────────────────────────────────────────
Records one row per emitted signal with all engine fields needed for
outcome tracking and calibration.

Usage:
    logger = SignalLogger()                     # default path
    logger.log_from_engine(result, symbol)      # result = EngineOutput.to_dict()
    logger.flush()                              # explicit flush (also auto on close)
"""

from __future__ import annotations

import csv
import os
import threading
from dataclasses import dataclass, field, fields
from datetime import datetime
from pathlib import Path
from typing import Optional

DEFAULT_LOG_DIR  = Path(__file__).parent.parent.parent / 'data' / 'signals'
DEFAULT_LOG_FILE = DEFAULT_LOG_DIR / 'signals.csv'

# ─── Row schema ───────────────────────────────────────────────────────────────

@dataclass
class SignalRecord:
    """One logged signal row."""
    # Identity
    timestamp:         str     = ''
    symbol:            str     = ''
    bar_index:         int     = 0       # populated externally by outcome tracker

    # Core engine output
    bias:              str     = 'NEUTRAL'
    confidence:        float   = 0.0
    gamma_regime:      str     = ''
    volatility_regime: str     = ''
    flow_direction:    str     = ''
    dealer_state:      str     = ''
    regime:            str     = ''
    confluence_score:  float   = 0.0

    # Price context
    price:             float   = 0.0
    gamma_flip:        float   = 0.0

    # Adaptive fields
    signal_confidence: float   = 0.0
    persistence_score: float   = 0.0
    signal_quality:    float   = 0.0
    adaptive_threshold:float   = 0.55

    # Squeeze
    gamma_squeeze:     bool    = False
    squeeze_strength:  float   = 0.0

    # Outcome fields — filled in later by OutcomeTracker
    ret_5m:            float   = float('nan')
    ret_15m:           float   = float('nan')
    ret_1h:            float   = float('nan')
    mfe:               float   = float('nan')   # max favorable excursion
    mae:               float   = float('nan')   # max adverse excursion
    hit_target:        bool    = False
    hit_stop:          bool    = False

    @classmethod
    def csv_header(cls) -> list[str]:
        return [f.name for f in fields(cls)]

    def to_row(self) -> list:
        return [getattr(self, f.name) for f in fields(self)]


# ─── Logger ───────────────────────────────────────────────────────────────────

class SignalLogger:
    """Thread-safe CSV logger for engine signals."""

    def __init__(self, path: Path = DEFAULT_LOG_FILE, buffer_size: int = 50) -> None:
        self.path        = Path(path)
        self.buffer_size = buffer_size
        self._lock       = threading.Lock()
        self._buffer: list[SignalRecord] = []
        self._ensure_file()

    # ── Public API ────────────────────────────────────────────────────────────

    def log(self, record: SignalRecord) -> None:
        """Append a signal record; flushes when buffer is full."""
        with self._lock:
            self._buffer.append(record)
            if len(self._buffer) >= self.buffer_size:
                self._write_buffer()

    def log_from_engine(self, result: dict, symbol: str = 'UNKNOWN',
                        bar_index: int = 0) -> SignalRecord:
        """
        Convenience: build a SignalRecord from EngineOutput.to_dict()
        (or the JS fallback dict — same shape).
        """
        meta  = result.get('meta', {})
        price = float(meta.get('price', result.get('price', 0)))
        kl    = result.get('key_levels', {})

        rec = SignalRecord(
            timestamp          = meta.get('timestamp', datetime.utcnow().isoformat()),
            symbol             = meta.get('symbol', symbol),
            bar_index          = bar_index,
            bias               = result.get('bias', 'NEUTRAL'),
            confidence         = float(result.get('confidence', 0)),
            gamma_regime       = result.get('gamma_regime', ''),
            volatility_regime  = result.get('volatility_regime', ''),
            flow_direction     = result.get('flow_direction', ''),
            dealer_state       = result.get('dealer_state', ''),
            regime             = result.get('regime', ''),
            confluence_score   = float(result.get('confluence_score', 0)),
            price              = price,
            gamma_flip         = float(kl.get('gamma_flip', 0)) if kl else 0.0,
            signal_confidence  = float(result.get('signal_confidence', 0)),
            persistence_score  = float(result.get('persistence_score', 0)),
            signal_quality     = float(result.get('signal_quality', 0)),
            adaptive_threshold = float(result.get('adaptive_threshold', 0.55)),
            gamma_squeeze      = bool(result.get('gamma_squeeze', False)),
            squeeze_strength   = float(result.get('squeeze_strength', 0)),
        )
        self.log(rec)
        return rec

    def flush(self) -> None:
        with self._lock:
            self._write_buffer()

    def load(self) -> list[SignalRecord]:
        """Read all logged records from disk (for evaluation)."""
        self.flush()
        if not self.path.exists():
            return []
        records: list[SignalRecord] = []
        with open(self.path, newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                rec = SignalRecord()
                for fld in fields(rec):
                    if fld.name in row:
                        raw = row[fld.name]
                        if fld.type in ('float', 'Optional[float]'):
                            try:
                                setattr(rec, fld.name, float(raw))
                            except (ValueError, TypeError):
                                pass
                        elif fld.type == 'int':
                            try:
                                setattr(rec, fld.name, int(raw))
                            except (ValueError, TypeError):
                                pass
                        elif fld.type == 'bool':
                            setattr(rec, fld.name, raw.lower() in ('true', '1', 'yes'))
                        else:
                            setattr(rec, fld.name, raw)
                records.append(rec)
        return records

    def __del__(self) -> None:
        try:
            self.flush()
        except Exception:
            pass

    # ── Internal ──────────────────────────────────────────────────────────────

    def _ensure_file(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            with open(self.path, 'w', newline='', encoding='utf-8') as f:
                csv.writer(f).writerow(SignalRecord.csv_header())

    def _write_buffer(self) -> None:
        """Write buffered rows to disk (caller must hold lock)."""
        if not self._buffer:
            return
        with open(self.path, 'a', newline='', encoding='utf-8') as f:
            w = csv.writer(f)
            for rec in self._buffer:
                w.writerow(rec.to_row())
        self._buffer.clear()
