# Keyboard controls

- Enter in a text, phone, email, password or number input submits that input's form once, with its existing validation. This covers login, barcode scan, product/customer forms, staff, payment and return/exchange forms.
- Enter on a focused button activates that button normally. Selects, date pickers, file controls and multiline text keep native keyboard behavior.
- Esc closes the active popup without submitting it. Form changes not saved are discarded. Focus returns to the control that opened shared popups.
- Esc closes notification/profile panels. On the page, Esc clears search first, then closes mobile navigation.
- POS: Enter outside input/button controls opens payment when the cart contains items. F4 also opens payment outside editable controls. Enter in the amount field confirms payment only after validation.
- F2 / Ctrl+K: page search. F6: hold sale. F7: held sales. F8: theme. Background shortcuts are suspended while a dialog is open; F6/F7/F4 do not interrupt typing.
- Barcode input Enter only adds the scanned product; it does not open payment.
- IME composition and held/repeating keys do not trigger extra submit or POS shortcut actions. SweetAlert owns its confirmation dialog keys.

Run: npm install, npm run dev. Check: npm test, npm run build.
