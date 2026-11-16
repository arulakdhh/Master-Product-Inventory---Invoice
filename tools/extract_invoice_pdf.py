import re, json, sys
lines=open(sys.argv[1]).read().split('\n')
date=re.compile(r'^\d{2}\.\d{2}\.\d{4}$')
num=lambda s: float(s.replace(',','').rstrip('-'))
rows=[];i=0
main=re.compile(r'^\s*(\d+)?\s+(\d{8})\s+(\S+)\s+(.*)$')
while i<len(lines):
    m=main.match(lines[i])
    if m:
        sr,hsn,mat,rest=m.groups()
        t=rest.split()
        igst=num(t[-1]);rate=num(t[-2]);taxable=num(t[-3]);k=-4
        freight=0.0
        if not t[k].endswith('-'):
            freight=num(t[k]);k-=1
        disc=num(t[k]);k-=1
        basic=num(t[k]);k-=1;r=num(t[k]);k-=1;mrp=num(t[k]);k-=1;qty=num(t[k]);k-=1;uom=t[k];k-=1
        exp=''
        if date.match(t[k]): exp=t[k];k-=1
        # batch: token before exp, maybe serial in between
        batch=t[k];serial=''
        if k-1>=-len(t) and len(t[k-1])>=6 and batch.startswith(t[k-1]) and batch!=t[k-1]:
            serial=batch;k-=1;batch=t[k]
        desc=' '.join(t[:k])
        # continuation
        nxt=lines[i+1]
        m2=re.match(r'^\s*(\d+)?(?:\s+(\S.*))?\s*$',nxt)
        if m2 and not main.match(nxt):
            if m2.group(1) and not sr: sr=m2.group(1)
            desc=(desc+' '+(m2.group(2) or '').strip()).strip(); i+=1
        rows.append(dict(sr=int(sr),hsn=hsn,mat=mat,desc=desc,batch=batch,serial=serial,exp=exp,uom=uom,qty=qty,mrp=mrp,rate=r,basic=basic,disc=disc,freight=freight,taxable=taxable,igst_rate=rate,igst=igst))
    i+=1
json.dump(rows,open('rows.json','w'),indent=0)
print(len(rows),[r['sr'] for r in rows]==list(range(1,len(rows)+1)))
print(sum(r['basic'] for r in rows),sum(r['disc'] for r in rows),sum(r['taxable'] for r in rows),round(sum(r['igst'] for r in rows),2),sum(r['freight'] for r in rows))
import collections
print(collections.Counter(len(r['batch']) for r in rows))
for r in rows[:3]+rows[15:17]+rows[-3:]: print(r)
