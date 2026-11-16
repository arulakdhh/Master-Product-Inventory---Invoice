// Shared invoice parser (browser + Node). Input: array of text lines.
function firstCo(l) {
  l = (l || '').trim();
  const m = l.match(/^(.*?(?:Private Limited|Pvt\.? Ltd\.?|Limited))/i);
  return m ? m[1].trim() : l.split(/\s{2,}/)[0];
}
function parseInvoiceLines(lines) {
  const dateRe = /^\d{2}\.\d{2}\.\d{4}$/;
  const num = s => parseFloat(String(s).replace(/,/g, '').replace(/-$/, ''));
  const main = /^\s*(\d+)?\s+(\d{8})\s+(\S+)\s+(.*)$/;
  const cont = /^\s*(\d+)?(?:\s+(\S.*))?\s*$/;
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(main);
    if (!m) continue;
    let [, sr, hsn, mat, rest] = m;
    const t = rest.trim().split(/\s+/);
    const at = k => t[t.length + k];
    let k = -1;
    const igst = num(at(k--)), igstRate = num(at(k--)), taxable = num(at(k--));
    let freight = 0;
    if (!at(k).endsWith('-')) freight = num(at(k--));
    const disc = num(at(k--)), basic = num(at(k--)), rate = num(at(k--)), mrp = num(at(k--)), qty = num(at(k--));
    const uom = at(k--);
    let exp = '';
    if (dateRe.test(at(k))) exp = at(k--);
    let batch = at(k--), serial = '';
    const prev = at(k);
    if (prev && prev.length >= 6 && batch.startsWith(prev) && batch !== prev) { serial = batch; batch = prev; k--; }
    let desc = t.slice(0, t.length + k + 1).join(' ');
    const nxt = lines[i + 1] || '';
    const m2 = nxt.match(cont);
    if (m2 && !main.test(nxt) && !/^\s*Page\s*:/.test(nxt)) {
      if (m2[1] && !sr) sr = m2[1];
      desc = (desc + ' ' + (m2[2] || '').trim()).trim();
      i++;
    }
    rows.push({ sr: parseInt(sr, 10), hsn, mat, desc, batch, serial, exp, uom, qty, mrp, rate, basic, disc, freight, taxable, igstRate, igst });
  }
  // header + footer
  const all = lines.join('\n');
  const g = re => { const x = all.match(re); return x ? x[1].trim() : ''; };
  const head = {
    invoiceNo: g(/Invoice No\.\s*:\s*(\S+)/),
    invoiceDate: g(/Invoice Date\s*:\s*(\d{2}\.\d{2}\.\d{4})/),
    dcNo: g(/D\.C\. No\.\s*:\s*(\S+)/),
    soNo: g(/S\.O\. No\.\s*:\s*(\S+)/),
    supplier: firstCo(lines.find(l => /Private Limited|Pvt\.? Ltd|Limited/i.test(l))),
    supplierGstin: g(/GSTIN No\. :\s*(\S+)/),
    buyer: (() => { const i = lines.findIndex(l => /Name & Address of Recipient/.test(l)); return i >= 0 ? firstCo(lines[i + 1]) : ''; })(),
    buyerGstin: g(/GSTIN No\s+:\s*(\S+)/),
    invoiceValue: num(g(/Invoice Value\s+([\d,]+\.\d{2})/) || 'NaN'),
  };
  let footer = null;
  const fi = lines.findIndex(l => /Total Amount In Words/.test(l));
  for (let j = fi - 1; j >= 0 && j > fi - 15; j--) {
    const nums = lines[j].trim().split(/\s+/);
    if (nums.length === 4 && nums.every(x => /^[\d,]+\.\d{2}-?$/.test(x))) {
      footer = { basic: num(nums[0]), disc: num(nums[1]), taxable: num(nums[2]), igst: num(nums[3]) };
      break;
    }
  }
  return { head, rows, footer };
}

async function pdfToLines(pdfjsLib, data) {
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const out = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items = tc.items.filter(it => it.str && it.str.trim()).map(it => ({ s: it.str, x: it.transform[4], y: it.transform[5], w: it.width }));
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const groups = [];
    for (const it of items) {
      const g = groups.find(g => Math.abs(g.y - it.y) < 2.5);
      if (g) g.items.push(it); else groups.push({ y: it.y, items: [it] });
    }
    groups.sort((a, b) => b.y - a.y);
    for (const g of groups) {
      g.items.sort((a, b) => a.x - b.x);
      // leading indent marker so that a line starting with a number vs HSN is preserved
      out.push(' ' + g.items.map(i => i.s.trim()).join(' '));
    }
  }
  return out;
}

if (typeof module !== 'undefined') module.exports = { parseInvoiceLines, pdfToLines };
