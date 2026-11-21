"use strict";
/* =====================================================================
   ⓘ help: a small "i" next to each number. Hover, tap or press Enter on it
   to see, in plain words, what the number is, how it is worked out and
   what to use it for. Add a text to INFO and call ib("Label").
   ===================================================================== */
const INFO = {
  /* Supplier invoices & PIDs (division boxes) */
  "Invoices": "Supplier invoices uploaded under this division.\nUse: check every supplier bill is in the register.",
  "PIDs issued": "How many DHH Product IDs this division has given out so far, one per invoice line (each batch / serial). Deleted lines keep their number retired, so it is never reused.\nUse: total products ever received.",
  "Next PID": "The ID the next new product line will get.\nUse: know where numbering continues.",

  /* Sales Analysis → Dashboard */
  "Turnover (excl. GST)": "Total of your tax invoices in the chosen period, before GST. Cancelled invoices are not counted.\nUse: how much you sold.",
  "Gross margin": "Turnover − what those items cost you at the purchase Rate.\nUse: what you earned on sales, before your own expenses (salary, rent, travel).",
  "Invoice value incl. GST": "Turnover + GST: the full amount billed to customers.\nUse: what customers have to pay you in total.",
  "Collections": "Money received from customers in this period (Payment Received).\nOutstanding = billed but not yet paid. Overdue = past the invoice due date.\nUse: how much cash actually came in.",
  "Purchases": "What you paid suppliers for invoices dated in this period: the taxable value, after the supplier's discount, before GST.\nExample: Meril Rate ₹5,880 − discount ₹3,234 = ₹2,646 counted here.\nUse: how much you bought.",
  "Stock at cost": "Pieces in stock now × purchase Rate (the Rate column on the supplier invoice, before the supplier's discount).\n'At hospitals' = stock sent on delivery challans and not billed yet.\nUse: value of the goods you are holding. It is higher than Purchases because Purchases is after Meril's discount.",
  "Forecast next 3 months": "Expected turnover for the next 3 months, worked out from your recent monthly sales trend.\nConfidence stays low until you have several months of sales.\nUse: plan stock and purchase orders.",
  "Monthly turnover and forecast": "Dark columns: turnover of each month (excl. GST). Light columns: forecast, with the line showing the likely low–high range.\nUse: see if sales are growing or slowing.",
  "Turnover by division": "Sales of each division (Meril Life Sciences, Cnergy …) in the period, excl. GST.\nUse: which company's products sell most.",
  "Top customers": "Customers ranked by turnover in the period.\nUse: know your most important hospitals.",
  "What to do next": "Suggestions from your sales pace, stock, expiry dates and payments: what to reorder, collect or push.\nUse: a to-do list for the week.",
  "Top products": "Products ranked by turnover in the period, with margin.\nUse: which products earn the most.",
  "Reorder list": "Products selling faster than your stock will last.\nWeeks of stock = in stock ÷ average sold per week.\nUse: what to put in the next purchase order.",

  /* Sales Analysis → Profit */
  "Sales value (excl. GST)": "Total of tax invoice lines in the period after hospital/surgeon discounts, before GST.\nUse: what you sold.",
  "Purchase cost (at Rate)": "Purchase Rate × quantity sold for every line on those invoices.\nUse: what the sold items cost you.",
  "Profit": "Sales value − purchase cost.\nUse: what you earned on these sales, before your own expenses.",
  "Profit margin": "Profit ÷ sales value.\nExample: sold ₹12,000, cost ₹4,000 → profit ₹8,000 → margin 66.7%.\nUse: how much of every rupee sold is profit.",
  "Profit % on purchase": "Profit ÷ purchase cost — the same idea as your Sell %.\nExample: cost ₹4,000, profit ₹8,000 → 200%.\nUse: check you are selling at the % you planned, after discounts.",
  "Discounts given": "Line discounts + hospital discounts + surgeon discounts on these invoices.\nUse: how much profit went into discounts.",

  /* Sales Analysis → Cash flow */
  "To collect from customers": "All unpaid amounts on your tax invoices, incl. GST.\nUse: money customers still owe you.",
  "Overdue now": "Unpaid invoices whose due date (invoice date + credit days) has passed.\nUse: who to follow up first.",
  "Expected in, next 30 days": "Unpaid invoices each customer should pay in the next 30 days, based on how many days that customer usually takes (or the default days if they have no payment history).\nUse: cash you can plan with.",
  "To pay suppliers": "Supplier invoices (incl. GST) that you have not marked paid yet.\nUse: what you owe suppliers.",
  "Due to suppliers, next 30 days": "Unpaid supplier invoices whose due date (invoice date + supplier credit days) falls in the next 30 days, or has passed.\nUse: payments to keep money ready for.",
  "Net cash, next 30 days": "Expected in from customers − due to suppliers, for the next 30 days.\nPlus = more coming in than going out. Minus = you need extra cash or faster collections.\nUse: spot a cash shortage early.",
  "Month by month": "Blue: billed to customers. Green: cash in (faded = expected). Orange: paid / due to suppliers.\nPast months are actual; this month and later are expected.\nRunning = net cash added up from this month on.\nUse: see which months will be tight.",
  "Expected from customers": "Every unpaid invoice with the date the money should come in, from that customer's usual payment days.\nUse: a collection plan.",
  "Supplier payments": "Every supplier invoice with its due date. Click Mark paid when you pay it.\nUse: never miss a supplier payment.",

  /* Sales Analysis → Payment cycle */
  "Cash cycle": "Stock held + customers pay in − supplier credit days.\nExample: 30 + 45 − 30 = 45 days: each rupee spent on stock comes back after about 45 days.\nUse: how much working capital you need. Shorter is better.",
  "Fast payers": "Customers who pay on average within 30 days of the invoice.",
  "Medium payers": "Customers who pay on average in 31–60 days.",
  "Slow payers": "Customers who take over 60 days on average.\nUse: ask for advance or shorter credit before supplying more.",
  "No payment yet": "Customers with invoices but no payment recorded in Payment Received yet.",

  /* Inventory → Product groups */
  "Categories": "Kinds of product: Plate, Screw, Nail, Hip stem …\nUse: see stock and sales by type.",
  "Product groups": "General names that hold every size of one product (e.g. all lengths of 3.5 Locking Screw).\nUse: count and compare products without listing every size.",
  "In stock": "Pieces in stock now. The ₹ below is pieces × purchase Rate.\nUse: what you are holding.",
  "Sold (tax invoices)": "Sales of these groups on active tax invoices (all time, excl. GST) and the profit on them.\nUse: which groups earn the most."
};
INFO["Sales value"] = INFO["Sales value (excl. GST)"];

function ib(key) {
  const t = INFO[String(key).replace(/<[^>]*>/g, "").trim()];
  return t ? `<button type="button" class="ibtn" data-info="${esc(t)}" aria-label="What is ${esc(String(key).replace(/<[^>]*>/g, ""))}?">i</button>` : "";
}

(function () {
  const st = document.createElement("style");
  st.textContent = `.ibtn{display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border-radius:50%;border:1px solid var(--muted);background:none;color:var(--muted);font:italic 700 10px/1 Georgia,serif;cursor:help;padding:0;margin-left:5px;vertical-align:1px;flex:none}
  .ibtn:hover,.ibtn:focus-visible,.ibtn.on{border-color:var(--accent);color:#fff;background:var(--accent);outline:none}
  #infopop{position:fixed;z-index:1000;max-width:320px;background:var(--ink);color:var(--surface);font-size:12.5px;line-height:1.5;padding:9px 12px;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.25);white-space:pre-line;pointer-events:none}
  @media print{.ibtn,#infopop{display:none!important}}`;
  document.head.appendChild(st);
  const pop = document.createElement("div"); pop.id = "infopop"; pop.hidden = true; pop.setAttribute("role", "tooltip"); document.body.appendChild(pop);
  let cur = null, pinned = false;
  const show = b => { cur = b; pop.textContent = b.dataset.info; pop.hidden = false; const r = b.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
    let x = Math.min(Math.max(8, r.left + r.width / 2 - pw / 2), innerWidth - pw - 8), y = r.bottom + 8; if (y + ph > innerHeight - 8) y = r.top - ph - 8;
    pop.style.left = x + "px"; pop.style.top = y + "px"; document.querySelectorAll(".ibtn.on").forEach(x => x.classList.remove("on")); b.classList.add("on"); };
  const hide = () => { pop.hidden = true; pinned = false; if (cur) cur.classList.remove("on"); cur = null; };
  document.addEventListener("mouseover", e => { const b = e.target.closest(".ibtn"); if (b && !pinned) show(b); });
  document.addEventListener("mouseout", e => { const b = e.target.closest(".ibtn"); if (b && !pinned && b === cur) hide(); });
  document.addEventListener("focusin", e => { const b = e.target.closest(".ibtn"); if (b) show(b); });
  document.addEventListener("focusout", e => { if (e.target.closest(".ibtn") && !pinned) hide(); });
  document.addEventListener("click", e => { const b = e.target.closest(".ibtn"); if (b) { e.preventDefault(); e.stopPropagation(); if (pinned && cur === b) hide(); else { show(b); pinned = true; } } else if (pinned) hide(); }, true);
  document.addEventListener("keydown", e => { if (e.key === "Escape") hide(); });
  addEventListener("scroll", () => { if (!pop.hidden) hide(); }, true);
})();
