import math, struct, zlib
from pathlib import Path
size=1024
rows=[]
for y in range(size):
 row=bytearray()
 for x in range(size):
  dx=x-512;dy=y-512;r=math.hypot(dx,dy)
  base=(int(16+9*y/size),int(48+18*x/size),int(183+39*(1-y/size)))
  angle=math.atan2(-dy,dx)
  if 0.72<angle<1.45 and r<330:
   f=.23*(angle-.72)/.73
   base=tuple(int(c+(255-c)*f) for c in base)
  ring=max(0,1-min(abs(r-145),abs(r-245),abs(r-345))/2.8)
  line=(0<x-512<252 and abs(dy+dx)<4.5 and r<346)
  dot=any(math.hypot(x-a,y-b)<rad for a,b,rad in [(512,512,15),(402,385,18),(639,607,13),(696,328,13)])
  cross=(abs(dx)<1.2 or abs(dy)<1.2) and r<345
  alpha=1 if dot or line else .4 if ring else .12 if cross else 0
  row.extend(int(c+(255-c)*alpha) for c in base)
 rows.append(b'\x00'+row)
def chunk(t,d):return struct.pack('!I',len(d))+t+d+struct.pack('!I',zlib.crc32(t+d)&0xffffffff)
png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',size,size,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(rows)))+chunk(b'IEND',b'')
Path('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png').write_bytes(png)
