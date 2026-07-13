from polybot.fees import FeeModel


def test_fee_peaks_at_half():
    f = FeeModel()
    assert f.taker_fee(100, 0.5, "sports") > f.taker_fee(100, 0.9, "sports")
    assert f.taker_fee(100, 0.5, "sports") > f.taker_fee(100, 0.1, "sports")


def test_fee_symmetric_around_half():
    f = FeeModel()
    assert abs(f.taker_fee(100, 0.3, "politics") - f.taker_fee(100, 0.7, "politics")) < 1e-12


def test_published_max_fee_per_100_shares():
    f = FeeModel()
    # $1.00 / 100 shares at p=0.5 for politics; $1.75 for crypto
    assert abs(f.taker_fee(100, 0.5, "politics") - 1.00) < 1e-9
    assert abs(f.taker_fee(100, 0.5, "crypto") - 1.75) < 1e-9
    assert f.taker_fee(100, 0.5, "geopolitics") == 0.0


def test_unknown_category_uses_conservative_default():
    f = FeeModel()
    assert f.taker_fee(100, 0.5, "some-new-category") == 100 * 0.05 * 0.25


def test_overrides_apply():
    f = FeeModel(overrides={"crypto": 0.02})
    assert abs(f.taker_fee(100, 0.5, "crypto") - 0.50) < 1e-9


def test_extreme_prices_clamped():
    f = FeeModel()
    assert f.taker_fee(100, 0.0, "sports") == 0.0
    assert f.taker_fee(100, 1.0, "sports") == 0.0
    assert f.taker_fee(100, 1.5, "sports") == 0.0  # clamped, not negative
