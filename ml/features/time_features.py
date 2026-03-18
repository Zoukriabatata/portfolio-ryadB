"""
Time-based Feature Engineering
────────────────────────────────────────────────────────────────────────────
Options markets have strong intraday patterns:
  - Market open (9:30–10:00 ET): highest vol, widest spreads, large sweeps
  - Lunch (12:00–13:30 ET): low vol, narrow spreads, trend continuation
  - Close (15:30–16:00 ET): high vol, aggressive hedging/unwinding
  - 0DTE (zero days to expiry): gamma explosion near expiry strikes

Time-to-expiry (DTE) effects:
  - Theta decay accelerates for 0DTE → gamma spikes near strikes
  - Market makers hedge 0DTE more aggressively → larger impact on spot
"""

import numpy as np
import pandas as pd
from datetime import datetime, time
from typing import Optional


# ─── Intraday session classification ─────────────────────────────────────────

SESSIONS = {
    'pre_market':    (time(4,  0), time(9, 29)),
    'open':          (time(9, 30), time(10, 0)),
    'morning':       (time(10, 0), time(12, 0)),
    'lunch':         (time(12, 0), time(13, 30)),
    'afternoon':     (time(13, 30), time(15, 30)),
    'close':         (time(15, 30), time(16, 0)),
    'after_market':  (time(16, 0), time(20, 0)),
}

SESSION_VOL_MULTIPLIERS = {
    'pre_market':   0.6,
    'open':         1.5,
    'morning':      1.0,
    'lunch':        0.6,
    'afternoon':    0.8,
    'close':        1.4,
    'after_market': 0.5,
}


def get_session(dt: datetime) -> str:
    """Return the named trading session for a given datetime (ET assumed)."""
    t = dt.time()
    for name, (start, end) in SESSIONS.items():
        if start <= t < end:
            return name
    return 'after_market'


def session_to_int(session: str) -> int:
    """Encode session as ordered integer (0=pre, 6=after)."""
    order = list(SESSIONS.keys())
    return order.index(session) if session in order else -1


# ─── Time-to-expiry features ─────────────────────────────────────────────────

def dte_features(days_to_expiry: float) -> dict:
    """
    Features derived from days-to-expiry.
    0DTE has fundamentally different dynamics (gamma explosion).
    """
    dte = max(days_to_expiry, 0.0)

    # Theta decay acceleration: proportional to 1/sqrt(T)
    theta_proxy = 1.0 / (np.sqrt(dte + 0.01))

    # 0DTE flag and near-expiry flags
    is_0dte     = int(dte < 1.0)
    is_near_exp = int(dte < 5.0)

    # Log-DTE for smooth ML feature
    log_dte = float(np.log(dte + 0.5))

    return {
        'dte':           float(dte),
        'log_dte':       log_dte,
        'theta_proxy':   float(theta_proxy),
        'is_0dte':       is_0dte,
        'is_near_exp':   is_near_exp,
    }


# ─── Calendar features ───────────────────────────────────────────────────────

def calendar_features(dt: datetime) -> dict:
    """
    Extract cyclical calendar features.
    Uses sine/cosine encoding to capture periodicity without ordinal bias.
    """
    # Day of week (0=Mon, 4=Fri)
    dow = dt.weekday()

    # Time of day in minutes since midnight
    minutes = dt.hour * 60 + dt.minute

    # Month of year
    month = dt.month

    # Cyclical encodings
    dow_sin   = np.sin(2 * np.pi * dow / 5)
    dow_cos   = np.cos(2 * np.pi * dow / 5)
    time_sin  = np.sin(2 * np.pi * minutes / (24 * 60))
    time_cos  = np.cos(2 * np.pi * minutes / (24 * 60))
    month_sin = np.sin(2 * np.pi * month / 12)
    month_cos = np.cos(2 * np.pi * month / 12)

    # Special market flags
    is_monday  = int(dow == 0)
    is_friday  = int(dow == 4)
    is_opex    = _is_options_expiry_week(dt)

    return {
        'dow_sin':   float(dow_sin),
        'dow_cos':   float(dow_cos),
        'time_sin':  float(time_sin),
        'time_cos':  float(time_cos),
        'month_sin': float(month_sin),
        'month_cos': float(month_cos),
        'is_monday': is_monday,
        'is_friday': is_friday,
        'is_opex':   int(is_opex),
    }


def _is_options_expiry_week(dt: datetime) -> bool:
    """
    Monthly options expiry = 3rd Friday of month.
    Returns True if current week contains monthly OPEX.
    """
    # Find 3rd Friday of the month
    first_day = dt.replace(day=1)
    # Weekday of first day (0=Mon)
    first_fri_offset = (4 - first_day.weekday()) % 7
    first_fri = first_day.day + first_fri_offset
    third_fri = first_fri + 14

    # Are we in OPEX week?
    try:
        opex = dt.replace(day=third_fri)
        week_start = opex - pd.Timedelta(days=opex.weekday())
        week_end   = week_start + pd.Timedelta(days=4)
        return week_start.date() <= dt.date() <= week_end.date()
    except ValueError:
        return False


# ─── Aggregate time features ─────────────────────────────────────────────────

def extract_time_features(
    dt:             datetime,
    days_to_expiry: float,
    is_opex_week:   Optional[bool] = None,
) -> dict:
    """
    Combine all time-based features for ML input.
    """
    features: dict = {}

    # Session
    session = get_session(dt)
    features['session']             = session_to_int(session)
    features['session_vol_mult']    = SESSION_VOL_MULTIPLIERS.get(session, 1.0)

    # DTE
    features.update(dte_features(days_to_expiry))

    # Calendar
    features.update(calendar_features(dt))

    # Override OPEX if provided externally
    if is_opex_week is not None:
        features['is_opex'] = int(is_opex_week)

    return features
