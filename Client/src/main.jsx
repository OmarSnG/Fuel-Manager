import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './style.css'

function ErrorBoundary({children}){
  const [err,setErr]=React.useState(null)
  React.useEffect(()=>{
    const handler=(e)=>{ setErr(e?.error||e); console.error('GlobalError:', e) }
    window.addEventListener('error',handler)
    window.addEventListener('unhandledrejection',handler)
    return ()=>{ window.removeEventListener('error',handler); window.removeEventListener('unhandledrejection',handler) }
  },[])
  if(err){
    let msg = err?.stack || (typeof err==='object'? JSON.stringify(err): String(err))
    return <div className="container">
      <h1>⚠️ Une erreur est survenue</h1>
      <div className="err">{msg}</div>
      <button onClick={()=>{ localStorage.removeItem("fuel-auth-token"); localStorage.removeItem("fuel-auth-session"); location.reload() }}>Reinitialiser session</button>
    </div>
  }
  return children
}

createRoot(document.getElementById('root')).render(<ErrorBoundary><App/></ErrorBoundary>)
