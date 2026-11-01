# Asymmetric Volatility in the Indian Equity Market - Statistical Report

Generated: 2026-10-31T11:39:04.133236+00:00
Sample: 2015-01-01 to 2025-12-31 (2725 daily log returns, Nifty 50)

## Hypothesis decision
**H0 REJECTED in favour of H1 (negative shocks have the larger effect) in the full-sample EGARCH(1,1)**

## Principal results
- Sample: 2725 daily log returns (2015-01-01 to 2025-12-31); mean 0.0422%, std 1.0267%, skewness -1.369, excess kurtosis 20.62; Jarque-Bera p = 0.
- The ADF statistic (-14.472) is below the 5% critical value (-2.863) with p = 6.578e-27. The unit-root null is REJECTED: the log-return series is stationary, so mean/variance models can be applied.
- Engle's ARCH-LM test with 10 lags on mean-equation residuals (r - mean): LM = 699.35, p = 8.651e-144. Null of no ARCH effects is rejected: conditional heteroskedasticity (volatility clustering) is present, which justifies GARCH-type models.
- GARCH(1,1): alpha = 0.1037, beta = 0.8720, alpha+beta = 0.9757 (below 1 (covariance-stationary)); half-life of a variance shock about 28.2 days.
- EGARCH(1,1), normal innovations: gamma = -0.0975 (SE 0.0200, t = -4.87, two-sided p = 1.131e-06; one-sided p for H1 gamma<0 = 5.657e-07). Gamma is negative and statistically significant at 5%: negative standardised shocks raise next-period log variance more than positive shocks of equal size. This supports H1 within this model and sample.
- EGARCH(1,1), t innovations: gamma = -0.1047 (SE 0.0157, t = -6.65, two-sided p = 2.933e-11; one-sided p for H1 gamma<0 = 1.466e-11). Gamma is negative and statistically significant at 5%: negative standardised shocks raise next-period log variance more than positive shocks of equal size. This supports H1 within this model and sample.

## Sub-period gamma (EGARCH, normal)
- Pre-COVID (2015-2019): gamma = -0.1460 (p = 5.72e-06)
- COVID (2020): gamma = -0.1597 (p = 2.32e-05)
- Post-COVID (2021-2025): gamma = -0.1348 (p = 0.00379)

## Formal tests of gamma differences
- [normal] Pre-COVID (2015-2019) vs COVID (2020): diff = 0.0137, z = 0.28, p = 0.782 (not significant)
- [normal] Pre-COVID (2015-2019) vs Post-COVID (2021-2025): diff = -0.0112, z = -0.20, p = 0.844 (not significant)
- [normal] COVID (2020) vs Post-COVID (2021-2025): diff = -0.0249, z = -0.42, p = 0.678 (not significant)
- [t] Pre-COVID (2015-2019) vs COVID (2020): diff = 0.1365, z = 4.98, p = 6.42e-07 (significant)
- [t] Pre-COVID (2015-2019) vs Post-COVID (2021-2025): diff = -0.0016, z = -0.03, p = 0.979 (not significant)
- [t] COVID (2020) vs Post-COVID (2021-2025): diff = -0.1380, z = -2.51, p = 0.0122 (significant)

## Model comparison (full sample)
| Model | LogLik | AIC | BIC | Converged |
|---|---|---|---|---|
| GARCH_normal | -3474.51 | 6957.02 | 6980.66 | True |
| EGARCH_normal | -3443.75 | 6897.51 | 6927.06 | True |
| GARCH_t | -3402.30 | 6814.60 | 6844.15 | True |
| EGARCH_t | -3367.64 | 6747.28 | 6782.74 | True |

## Caveats
- Statistical significance is not economic significance: compare the size of gamma-implied variance differences with day-to-day volatility.
- Lowest AIC/BIC shows relative fit, not that asymmetry is real or the hypothesis is true; the hypothesis is tested through gamma.
- Differences in gamma across periods are only called significant when the formal Wald test says so (see robustness page).
- The 2020 sub-sample has about 250 observations, so estimates are imprecise and may be sensitive to starting values.
- A negative DAILY RETURN is not the same as a negative standardised INNOVATION z(t); EGARCH responds to z(t) = eps(t)/sigma(t).
- Shock simulations are model-implied scenarios, not forecasts.