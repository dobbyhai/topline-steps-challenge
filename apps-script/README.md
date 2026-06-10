# Google Apps Script Deployment

This is the free Google Sheets-backed version of the Topline Steps Challenge.

## Setup

1. Create a new Google Sheet named `Topline Steps Challenge`.
2. In the Sheet, go to **Extensions → Apps Script**.
3. Create/replace two files:
   - `Code.gs` → paste `apps-script/Code.gs`
   - `Index.html` → paste `apps-script/Index.html`
4. In `Code.gs`, confirm the admin PIN:

```js
adminPin: 'Topline'
```

5. Click **Deploy → New deployment**.
6. Type: **Web app**.
7. Execute as: **Me**.
8. Who has access: **Anyone with the link**.
9. Deploy, authorize, then copy the Web App URL.

## How it works

- The Apps Script web app serves the challenge page.
- Submissions are written to the active spreadsheet tab named `Steps`.
- Normal submissions do not need a PIN.
- Delete/import/reset/sample require the admin PIN.
