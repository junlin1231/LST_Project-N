You are an expert full-stack software architect and senior developer specializing in enterprise financial systems, accounting software, and Enterprise Resource Planning (ERP) architecture. 

Your task is to design, architect, and implement a fully complete, end-to-end accounting and business management system. The system must seamlessly integrate front-end operational workflows with backend financial ledgers, regulatory compliance tools, and strict interactive safety controls.

Please structure your implementation, database schema design, and API architecture to cover the following comprehensive modules, emphasizing strict **CRUD governance, immutability, and mandatory interactive double-confirmation pop-outs (UI/UX validation state machines)** for high-risk actions across all documents and ledgers:

### 1. Interactive UI/UX Safety Architecture & Double-Confirmation Workflows
* **Destructive & High-Impact Action Interception:** Any user interaction attempting to trigger a state change (such as `Submit`, `Post`, `Void`, `Cancel`, `Approve`, or `Delete` on draft items) must not execute immediately. 
* **Double-Confirmation Pop-Out Mechanism:** The frontend must present an explicit modal dialog (Double Confirmation Pop-out) requiring the user to:
  1. Review a clear summary of the impact (e.g., "This will post a journal entry of $10,000 to the General Ledger and cannot be deleted").
  2. Provide a mandatory reason code or audit remark for non-standard actions (modifications/cancellations).
  3. Perform a secondary deliberate confirmation action (e.g., typing a confirmation phrase or clicking a distinct secondary "Confirm & Proceed" button).
* **Role-Based Override Protection:** Certain high-risk actions (such as overriding a closed period or deleting un-posted draft items) must require supervisor PIN or secondary authorization credentials within the confirmation dialog.

### 2. Core Financial Engine (General Ledger & Sub-ledgers)
* **General Ledger (GL):** Chart of Accounts (COA) management, journal entry creation with strict double-entry balance validation, multi-currency support with automated exchange rate conversion, period-end closing routines, and retained earnings calculation.
  * *Governance & Confirmation:* Posting a journal entry requires a double-confirmation modal. Once posted, deletion is blocked; modifications require a double-confirmed reversing or adjusting entry.
* **Accounts Receivable (AR):** Customer profile and credit limit management, invoice creation, payment allocation, aging analysis, and bad debt provisions.
* **Accounts Payable (AP):** Vendor management, purchase bill processing, payment scheduling, and vendor aging tracking.
* **Cash & Bank Management:** Bank account management, multi-currency cash journals, and automated/manual Bank Reconciliation against imported bank statement feeds (CSV or API).

### 3. Operational Workflows (Front-End Business Processes)
* **Sales / Order-to-Cash (O2C):** Quotations $\rightarrow$ Sales Orders $\rightarrow$ Delivery Orders (triggering real-time inventory decrement) $\rightarrow$ Sales Invoices (triggering AR creation and revenue recognition) $\rightarrow$ Official Receipts (triggering bank increase and AR settlement).
  * *Governance & Confirmation:* Converting states (e.g., Draft to Posted Invoice, or voiding a Delivery Order) mandates a double-confirmation pop-out with audit logging.
* **Procurement / Procure-to-Pay (P2P):** Purchase Requisitions $\rightarrow$ Purchase Orders (PO) $\rightarrow$ Goods Received Notes (GRN, triggering inventory increment) $\rightarrow$ Vendor Bills (triggering AP increase) $\rightarrow$ Payment Vouchers (triggering bank decrease and AP settlement).
* **Inventory & Warehouse Management:** Multi-warehouse and bin locations, stock movements (in, out, transfers, adjustments), stock counts/audits, and inventory valuation methods (FIFO, Weighted Average).

### 4. Specialized & Administrative Modules
* **Fixed Assets:** Asset registration cards (purchase price, useful life, salvage value), automated monthly depreciation journal generation, and asset disposal/retirement tracking.
* **Payroll & Human Resources:** Employee profiles, attendance integration, automated salary calculation (base, allowances, deductions, statutory contributions), payroll generation, and automatic posting of salary expenses to the GL.
* **Tax Management & Compliance:** Automated input/output tax calculations, tax reporting, and a robust **E-Invoice Integration Gateway** capable of connecting directly to national tax authority platforms (such as Malaysia's LHDN MyInvois system) for real-time document validation, submission, and status tracking (Validated, Cancelled, Rejected).
  * *Governance & Confirmation:* Submitting an e-invoice to LHDN or canceling a validated invoice requires a strict multi-step double-confirmation modal displaying tax compliance warnings.
* **Budgeting & Control:** Departmental and project-based budget allocation, actual vs. budget variance tracking, and real-time over-budget alerts.

### 5. Reporting & Audit Trail
* **Financial Statements:** Automated generation of the Balance Sheet, Income Statement (Profit & Loss), Cash Flow Statement, and Trial Balance.
* **Management Reports:** Gross profit analysis by product/customer, expense breakdowns, and multi-dimensional profit-center reporting.
* **Audit Trail & Internal Controls:** Immutable logging of user activity (timestamp, user ID, IP, confirmation modal interaction metadata, action performed, before/after values for modified records) to ensure strict compliance with GAAP/IFRS standards and data integrity.

Please provide a structured system architecture blueprint, frontend component designs for the **double-confirmation pop-out modals**, state-machine routing rules, database schemas, and API implementation logic required to build this secure, audit-ready system.