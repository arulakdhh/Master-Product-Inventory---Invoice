import json,collections,datetime
from openpyxl import Workbook
from openpyxl.styles import Font,PatternFill,Alignment,Border,Side
from openpyxl.comments import Comment
R=json.load(open('rows.json'))
wb=Workbook();ws=wb.active;ws.title='Invoice Items'
F=lambda **k:Font(**{'name':'Arial','size':10,**k})
thin=Side(style='thin',color='BFBFBF');B=Border(left=thin,right=thin,top=thin,bottom=thin)
hdrfill=PatternFill('solid',fgColor='1F4E78')
ws['A1']='Meril Healthcare Pvt Ltd – Invoice No. 9426313395 dated 22.10.2026 – Product Details';ws['A1'].font=F(bold=True,size=12)
ws['A2']='Highlighted rows = same Material Code appears in more than one row (same colour = same product). Match Count column shows how many rows share that code.';ws['A2'].font=F(italic=True,color='595959')
H=['Sr. No.','HSN/SAC Code','Material Code','Description of Goods / Service','Batch No.','Serial No.','Expiry Date','UOM','QTY','MRP','Rate','Basic Amount','Discount Amount','Freight Charges','Taxable Amount','IGST Rate (%)','IGST Amount','Match Count','Matching Sr. Nos.']
hr=4
for c,h in enumerate(H,1):
    x=ws.cell(hr,c,h);x.font=F(bold=True,color='FFFFFF');x.fill=hdrfill;x.alignment=Alignment(wrap_text=True,horizontal='center',vertical='center');x.border=B
pal=['FFF2CC','DDEBF7','E2EFDA','FCE4D6','EDE2F6','D9F2F2']
groups=collections.defaultdict(list)
for r in R: groups[r['mat']].append(r['sr'])
order=[m for m in dict.fromkeys(r['mat'] for r in R) if len(groups[m])>1]
col={m:pal[i%len(pal)] for i,m in enumerate(order)}
first=hr+1;last=hr+len(R)
for i,r in enumerate(R):
    row=first+i
    exp=datetime.datetime.strptime(r['exp'],'%d.%m.%Y') if r['exp'] else None
    vals=[r['sr'],r['hsn'],r['mat'],r['desc'],r['batch'],r['serial'] or None,exp,r['uom'],r['qty'],r['mrp'],r['rate'],r['basic'],r['disc'],r['freight'],r['taxable'],r['igst_rate'],r['igst'],
          f'=COUNTIF($C${first}:$C${last},C{row})', ', '.join(map(str,groups[r['mat']])) if len(groups[r['mat']])>1 else '']
    for c,v in enumerate(vals,1):
        x=ws.cell(row,c,v);x.font=F(color='0000FF' if 9<=c<=17 else '000000');x.border=B
        if r['mat'] in col: x.fill=PatternFill('solid',fgColor=col[r['mat']])
    ws.cell(row,7).number_format='dd.mm.yyyy'
    ws.cell(row,9).number_format='0'
    for c in (10,11,12,13,14,15,17): ws.cell(row,c).number_format='#,##0.00;(#,##0.00);-'
    ws.cell(row,16).number_format='0.00'
    ws.cell(row,18).number_format='0';ws.cell(row,18).alignment=Alignment(horizontal='center')
    if r['mat'] in col: ws.cell(row,18).font=F(bold=True,color='C00000')
for r in R:
    if not r['exp']: ws.cell(r['sr']+hr,7).comment=Comment('No expiry date printed on the invoice for this line.','Claude')
t=last+1
ws.cell(t,4,'TOTAL').font=F(bold=True)
for c,L in [(9,'I'),(12,'L'),(13,'M'),(14,'N'),(15,'O'),(17,'Q')]:
    x=ws.cell(t,c,f'=SUM({L}{first}:{L}{last})');x.font=F(bold=True);x.number_format='#,##0.00;(#,##0.00);-' if c!=9 else '0';x.border=Border(top=Side(style='medium'),bottom=Side(style='double'))
# check vs invoice footer
c0=t+2
ws.cell(c0,4,'Invoice footer totals (as printed on page 65)').font=F(bold=True)
for c,v in [(12,4206225.25),(13,1128781.16),(15,3077444.09),(17,153873.04)]:
    x=ws.cell(c0,c,v);x.font=F(color='0000FF');x.number_format='#,##0.00'
ws.cell(c0+1,4,'Difference (extracted total – invoice total)').font=F(bold=True)
for c,L in [(12,'L'),(13,'M'),(15,'O'),(17,'Q')]:
    x=ws.cell(c0+1,c,f'=ROUND({L}{t}-{L}{c0},2)');x.number_format='#,##0.00;(#,##0.00);0.00';x.font=F(bold=True,color='008000')
ws.cell(c0+3,4,'Invoice Value (Taxable + IGST, as printed)').font=F(bold=True)
x=ws.cell(c0+3,15,3231316.65);x.font=F(color='0000FF');x.number_format='#,##0.00'
ws.cell(c0+4,4,'Note: Discount shown as positive amount (printed with trailing "-" on invoice). Blue = values extracted from the PDF.').font=F(italic=True,color='595959')
W=[7,11,17,44,12,14,11,6,6,11,10,12,12,9,12,8,10,8,22]
for i,w in enumerate(W,1): ws.column_dimensions[ws.cell(hr,i).column_letter].width=w
ws.row_dimensions[hr].height=30
ws.freeze_panes=ws.cell(hr+1,4)
ws.auto_filter.ref=f'A{hr}:S{last}'
# Summary
s=wb.create_sheet('Matching Rows')
s['A1']='Products (Material Codes) appearing in more than one row';s['A1'].font=F(bold=True,size=12)
s['A2']=f'{len(order)} material codes repeat across {sum(len(groups[m]) for m in order)} rows. No row repeats the same Material Code + Batch No. + Serial No. (no exact duplicates).';s['A2'].font=F(italic=True,color='595959')
SH=['Material Code','Description','No. of Rows','Sr. Nos.','Batch Nos. (/Serial No.)','Total QTY','Total Basic Amount','Total Taxable Amount','Total IGST Amount']
for c,h in enumerate(SH,1):
    x=s.cell(4,c,h);x.font=F(bold=True,color='FFFFFF');x.fill=hdrfill;x.border=B;x.alignment=Alignment(wrap_text=True,horizontal='center',vertical='center')
rng=lambda L:f"'Invoice Items'!${L}${first}:${L}${last}"
bym={r['mat']:r for r in R}
for i,m in enumerate(order):
    row=5+i
    batches=', '.join(r['batch']+('/'+r['serial'] if r['serial'] else '') for r in R if r['mat']==m)
    vals=[m,bym[m]['desc'],f"=COUNTIF({rng('C')},A{row})",', '.join(map(str,groups[m])),batches,
          f"=SUMIF({rng('C')},A{row},{rng('I')})",f"=SUMIF({rng('C')},A{row},{rng('L')})",f"=SUMIF({rng('C')},A{row},{rng('O')})",f"=SUMIF({rng('C')},A{row},{rng('Q')})"]
    for c,v in enumerate(vals,1):
        x=s.cell(row,c,v);x.font=F();x.border=B;x.fill=PatternFill('solid',fgColor=col[m])
        if c>=7: x.number_format='#,##0.00'
        if c in(3,6): x.number_format='0';x.alignment=Alignment(horizontal='center')
for i,w in enumerate([17,42,8,22,60,9,14,14,12],1): s.column_dimensions[s.cell(4,i).column_letter].width=w
s.row_dimensions[4].height=30;s.freeze_panes='B5'
wb.save('Invoice_9426313395_Product_Details.xlsx')
print(len(order))
