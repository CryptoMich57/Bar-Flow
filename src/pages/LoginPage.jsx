import { Link } from 'react-router-dom'
import { getNombreBar, getLogo, getCopyright } from '../config'

// Pantalla puente para el personal: cada vista pide su propia cuenta.
const VISTAS = [
  { to: '/encargado', emoji: '🧑‍💼', label: 'Encargado', desc: 'Salon, carta, caja e historial' },
  { to: '/cocina',    emoji: '👨‍🍳', label: 'Cocina',    desc: 'Comandas para preparar' },
  { to: '/mozo',      emoji: '🧍',   label: 'Mozo',      desc: 'Alertas y pedidos de tus mesas' },
]

export default function LoginPage() {
  return (
    <div className="pantallaEstado" style={{alignItems:'center'}}>
      <div style={{width:'100%', maxWidth:380}}>
        <img src={getLogo()} alt="Logo" style={{width:64, height:64, objectFit:'contain', display:'block', margin:'0 auto 16px'}}
          onError={e => e.target.style.display='none'} />
        <h2 style={{textAlign:'center', color:'var(--gold)', margin:0}}>{getNombreBar()}</h2>
        <p style={{textAlign:'center', color:'var(--text2)', fontSize:'0.9em', margin:'6px 0 24px'}}>
          Acceso del personal
        </p>
        {VISTAS.map(v => (
          <Link key={v.to} to={v.to} className="card" style={{
            display:'flex', alignItems:'center', gap:14, marginBottom:12,
            textDecoration:'none', color:'inherit', padding:'14px 16px'
          }}>
            <span style={{fontSize:'1.6em'}}>{v.emoji}</span>
            <span style={{display:'flex', flexDirection:'column'}}>
              <strong style={{fontSize:'0.95em'}}>{v.label}</strong>
              <span style={{color:'var(--text2)', fontSize:'0.8em'}}>{v.desc}</span>
            </span>
          </Link>
        ))}
        <p style={{color:'var(--text3)', fontSize:'0.72em', textAlign:'center', marginTop:24}}>
          {getCopyright()}
        </p>
      </div>
    </div>
  )
}
