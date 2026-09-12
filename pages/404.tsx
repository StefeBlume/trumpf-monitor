import Head from 'next/head';
// Next.js liefert sonst seine englische Standardseite - in einer durchgehend deutschen App.
// Die Seite traegt ihre Gestaltung selbst, damit sie auch dann lesbar ist, wenn das ausgelagerte
// Stylesheet fehlt (etwa bei einer zwischengespeicherten Seite nach einem Deploy).
export default function NichtGefunden(){
 return <><Head><title>Seite nicht gefunden · Policy Monitor</title><meta name="robots" content="noindex"/></Head>
 <main style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:'32px',
  background:'#f4f6f9',color:'#18213b',
  fontFamily:'Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'}}>
  <div style={{maxWidth:'460px',textAlign:'center'}}>
   <p style={{fontSize:'11px',fontWeight:650,letterSpacing:'1.5px',color:'#657089',margin:'0 0 12px'}}>POLICY MONITOR · TRUMPF</p>
   <h1 style={{fontSize:'32px',letterSpacing:'-1px',lineHeight:1.2,margin:'0 0 12px'}}>Diese Seite gibt es nicht.</h1>
   <p style={{fontSize:'15px',lineHeight:1.6,color:'#53617b',margin:'0 0 24px'}}>
    Die Adresse führt ins Leere. Das Lagebild mit den aktuellen Thementreffern erreichst du über den Weg zurück.</p>
   <a href="." style={{display:'inline-block',background:'#173fe2',color:'#fff',textDecoration:'none',
    borderRadius:'8px',padding:'12px 18px',fontSize:'14px',fontWeight:600}}>Zum Lagebild</a>
  </div>
 </main></>;
}
