You are an expert full-stack software engineer and financial systems architect. Please design and implement a comprehensive accounting system module in English. 

The system must handle complete bookkeeping, automated calculations, and generate the standard full set of financial statements according to international accounting standards.

### Core Requirements:

1. Chart of Accounts (COA) & General Ledger (GL):
   - Support standard categories: Assets, Liabilities, Equity (Capital), Revenue, and Expenses.
   - Implement double-entry bookkeeping validation (Debits must equal Credits for every transaction).

2. Fixed Assets & Depreciation (P&L Integration):
   - Allow users to record capital assets (e.g., Vehicles, Equipment) with purchase cost and useful life.
   - Automatically calculate annual/monthly depreciation and post the expense entries to the Profit and Loss Statement.
   - Track and update Accumulated Depreciation and Net Book Value on the Statement of Financial Position.

3. Complete Financial Statements Generation (Year-End / Period-End):
   - Statement of Profit or Loss (Income Statement): Tracks revenue, operating expenses, depreciation, and calculates Net Profit/Loss.
   - Statement of Financial Position (Balance Sheet): Displays Assets, Liabilities, and Equity (including retained earnings/capital adjustments).
   - Statement of Cash Flows: Categorizes cash movements into Operating, Investing, and Financing activities.
   - Statement of Changes in Equity: Reflects changes in capital, profits, and withdrawals.
   - Notes to Financial Statements: Supporting details for ledger items.

4. Technical Stack & Architecture:
   - Provide clean, modular code structure (Backend logic for calculations and Frontend components for reporting UI).
   - Ensure data integrity during period-end closing (rolling over net profit to equity/retained earnings).

Please provide the structural database schema, key calculation logic/algorithms (especially for depreciation and financial statement compilation), and API endpoint designs.