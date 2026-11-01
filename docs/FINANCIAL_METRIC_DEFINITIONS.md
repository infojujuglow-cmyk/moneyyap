# Financial Metric Definitions

| Metric | Source | Basis | Calculation |
|---|---|---|---|
| Operating income | MoneyYap transactions | Cash | Income cash movements classified `operating`; transfers and refunds excluded |
| Operating expense | MoneyYap transactions | Cash | Expense cash movements classified `operating`, less refunds |
| Operating result | Derived | Cash | Operating income minus operating expense |
| Available cash | MoneyYap account balances | Cash balance as of period end | Active non-credit-card, non-private accounts in the authorized Business Space, with later account effects reversed |
| Receivables | MoneyYap obligations | Outstanding | Original receivable less linked settlement transactions |
| Payables | MoneyYap obligations | Outstanding | Original payable less linked settlement transactions |
| Budget utilization | MoneyYap monthly budgets | Cash actual | Operating expense divided by the selected allocation |
| Project actual spending | MoneyYap project allocations | Cash | Operating expense allocations, net of refunds |

Capital contributions, withdrawals, owner loans, and loan repayments are reported separately and never included in operating income, operating expense, or operating result. Internal transfers and credit-card payments do not change portfolio income or expense.

Portfolio totals are valid only when currency and reporting basis match. Venture OS must display coverage and avoid combining missing or incompatible businesses.
