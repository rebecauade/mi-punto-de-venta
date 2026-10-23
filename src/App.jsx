import React, { useState, useMemo, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut, 
  createUserWithEmailAndPassword 
} from 'firebase/auth';
import { 
  getFirestore, collection, doc, setDoc, getDoc, deleteDoc, onSnapshot, increment 
} from 'firebase/firestore';
import { 
  ShoppingCart, Package, Trash2, Edit2, LogOut, Users, Phone, 
  Search, Eye, AlertCircle, FileText, Check, DollarSign, Smartphone, Ticket, Layers, UserCheck, UserX, Shield
} from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';

// --- CONFIGURACIÓN DE FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyDKcKgDWd55WdBDTum1VDs5EWBNn13XS3g",
  authDomain: "taloapp-57a5b.firebaseapp.com",
  projectId: "taloapp-57a5b",
  storageBucket: "taloapp-57a5b.firebasestorage.app",
  messagingSenderId: "132785823103",
  appId: "1:132785823103:web:57253ee11b3ac197de8e4a",
  measurementId: "G-P93FEE87R4"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export default function App() {
  useRegisterSW({ immediate: true });

  // Estados de Sesión y Perfil (SaaS Multi-Empresa)
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null); // { empresaId, rol: 'admin'|'empleado', activo: boolean, name: string }
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  const [activeTab, setActiveTab] = useState('pos');
  
  // Login Form
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Datos del Local
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [cart, setCart] = useState([]);
  const [sales, setSales] = useState([]);
  const [vales, setVales] = useState([]); 
  const [teamMembers, setTeamMembers] = useState([]); // Lista de empleados

  const [currentTicket, setCurrentTicket] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  
  // Métodos de Pago
  const [paymentMethod, setPaymentMethod] = useState('efectivo');
  const [splitCash, setSplitCash] = useState(''); 
  const [splitDigital, setSplitDigital] = useState(''); 

  // Filtros
  const [productSearchQuery, setProductSearchQuery] = useState(''); 
  const [customerSearchQuery, setCustomerSearchQuery] = useState(''); 
  const [selectedReportDate, setSelectedReportDate] = useState(new Date().toLocaleDateString('sv-SE'));

  // Modales
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productForm, setProductForm] = useState({ name: '', price: '', stock: '' });

  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [customerForm, setCustomerForm] = useState({ name: '', phone: '', hasDebt: false, debtAmount: '' });
  
  const [isValeModalOpen, setIsValeModalOpen] = useState(false); 
  const [valeForm, setValeForm] = useState({ customerName: '', vaciosDebidos: '', entregó: '', yaPago: false });

  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [teamForm, setTeamForm] = useState({ name: '', email: '', password: '' });

  const [viewingCustomerHistory, setViewingCustomerHistory] = useState(null);
  const [editingDebts, setEditingDebts] = useState({});

  // 1. CARGA DE AUTENTICACIÓN Y COMPROBACIÓN ON/OFF DE ACCESO
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (usr) => {
      if (usr) {
        try {
          const userDocSnap = await getDoc(doc(db, 'users', usr.uid));
          if (userDocSnap.exists()) {
            const profileData = userDocSnap.data();

            // CONTROL DE ACCESO ON / OFF
            if (profileData.activo === false) {
              await signOut(auth);
              setUser(null);
              setUserProfile(null);
              setLoginError('Tu cuenta está inhabilitada. Consulta con el administrador de la empresa.');
              setIsCheckingAuth(false);
              return;
            }

            setUser(usr);
            setUserProfile(profileData);
          } else {
            // Perfil por defecto en caso de migración inicial
            const defaultProfile = {
              empresaId: usr.uid,
              rol: 'admin',
              activo: true,
              name: usr.email ? usr.email.split('@')[0] : 'Admin'
            };
            setUser(usr);
            setUserProfile(defaultProfile);
          }
        } catch (err) {
          console.error("Error leyendo perfil del usuario:", err);
        }
      } else {
        setUser(null);
        setUserProfile(null);
      }
      setIsCheckingAuth(false);
    });
    return () => unsub();
  }, []);

  // 2. LECTURA DE LA BASE DE DATOS AISLADA POR EMPRESA (empresaId)
  useEffect(() => {
    if (!user || !userProfile?.empresaId) return;

    const empId = userProfile.empresaId;

    // Productos del local
    const unsubProds = onSnapshot(collection(db, 'empresas', empId, 'products'), snap => {
      const p = []; snap.forEach(d => p.push({ id: d.id, ...d.data() }));
      setProducts(p);
    });

    // Clientes del local
    const unsubCusts = onSnapshot(collection(db, 'empresas', empId, 'customers'), snap => {
      const c = []; snap.forEach(d => c.push({ id: d.id, ...d.data() }));
      setCustomers(c);
      
      const initialDebts = {};
      snap.forEach(d => {
        initialDebts[d.id] = d.data().debtAmount || 0;
      });
      setEditingDebts(initialDebts);
    });

    // Ventas del local
    const unsubSales = onSnapshot(collection(db, 'empresas', empId, 'sales'), snap => {
      const s = []; snap.forEach(d => s.push({ id: d.id, ...d.data() }));
      s.sort((a,b) => b.timestamp - a.timestamp);
      setSales(s);
    });

    // Vales del local
    const unsubVales = onSnapshot(collection(db, 'empresas', empId, 'vales'), snap => {
      const v = []; snap.forEach(d => v.push({ id: d.id, ...d.data() }));
      v.sort((a,b) => b.timestamp - a.timestamp);
      setVales(v);
    });

    // Si el usuario es ADMIN, escucha la lista de empleados de su empresa
    let unsubTeam = () => {};
    if (userProfile.rol === 'admin') {
      unsubTeam = onSnapshot(collection(db, 'users'), snap => {
        const team = [];
        snap.forEach(d => {
          const u = d.data();
          if (u.empresaId === empId && d.id !== user.uid) {
            team.push({ id: d.id, ...u });
          }
        });
        setTeamMembers(team);
      });
    }

    return () => { unsubProds(); unsubCusts(); unsubSales(); unsubVales(); unsubTeam(); };
  }, [user, userProfile]);

  // --- LÓGICA DE FILTROS Y TOTALES ---
  const filteredProducts = useMemo(() => {
    return products.filter(p => p.name.toLowerCase().includes(productSearchQuery.toLowerCase()));
  }, [products, productSearchQuery]);

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => c.name.toLowerCase().includes(customerSearchQuery.toLowerCase()));
  }, [customers, customerSearchQuery]);

  const cartTotal = useMemo(() => {
    return cart.reduce((t, i) => t + (i.unitPrice * i.quantity), 0);
  }, [cart]);

  const isSplitTotalCorrect = useMemo(() => {
    if (paymentMethod !== 'combinado') return true;
    const cashNum = Number(splitCash || 0);
    const digitalNum = Number(splitDigital || 0);
    return (cashNum + digitalNum) === cartTotal;
  }, [paymentMethod, splitCash, splitDigital, cartTotal]);

  const reportStats = useMemo(() => {
    const todayLabel = new Date().toLocaleDateString('sv-SE');

    let calendarRevenue = 0;
    let calendarCash = 0;
    let calendarDigital = 0;
    let calendarCount = 0;
    const calendarSales = [];

    sales.forEach(s => {
      const saleDateLabel = s.plainDate || new Date(s.timestamp || Date.now()).toLocaleDateString('sv-SE');

      if (saleDateLabel === selectedReportDate) {
        calendarSales.push(s);
        calendarRevenue += s.total;
        calendarCount += 1;
        
        if (s.paymentMethod === 'digital' || s.paymentMethod === 'virtual') {
          calendarDigital += s.total;
        } else if (s.paymentMethod === 'combinado') {
          calendarCash += Number(s.splitCash || 0);
          calendarDigital += Number(s.splitDigital || 0);
        } else {
          calendarCash += s.total;
        }
      }
    });

    const isToday = selectedReportDate === todayLabel;
    return { calendarRevenue, calendarCash, calendarDigital, calendarCount, calendarSales, isToday };
  }, [sales, selectedReportDate]);

  // --- ACCIONES GENERALES ---
  const handleLogin = (e) => {
    e.preventDefault();
    setLoginError('');
    signInWithEmailAndPassword(auth, email, password).catch(() => setLoginError('Email o contraseña incorrectos.'));
  };

  const addToCart = (p) => {
    const existing = cart.find(item => item.product.id === p.id);
    if (existing) setCart(cart.map(item => item.product.id === p.id ? { ...item, quantity: item.quantity + 1 } : item));
    else setCart([...cart, { product: p, quantity: 1, unitPrice: p.price }]);
  };

  const updateCartPrice = (id, newPrice) => {
    setCart(cart.map(i => i.product.id === id ? { ...i, unitPrice: Number(newPrice) } : i));
  };

  const updateCartQty = (id, newQty) => {
    setCart(cart.map(i => i.product.id === id ? { ...i, quantity: Number(newQty) } : i));
  };

  const handleCheckout = async () => {
    if (cart.length === 0 || !user || !userProfile?.empresaId || !isSplitTotalCorrect) return;
    const empId = userProfile.empresaId;
    const saleId = Date.now().toString();
    const plainDate = new Date().toLocaleDateString('sv-SE');

    const newSale = { 
      date: new Date().toLocaleString(), 
      plainDate,
      timestamp: Date.now(), 
      items: cart.map(i => ({ name: i.product.name, qty: i.quantity, price: i.unitPrice })), 
      total: cartTotal,
      customerName: selectedCustomer ? selectedCustomer.name : 'Cliente General',
      paymentMethod: paymentMethod === 'digital' ? 'virtual' : paymentMethod,
      splitCash: paymentMethod === 'combinado' ? Number(splitCash || 0) : 0,
      splitDigital: paymentMethod === 'combinado' ? Number(splitDigital || 0) : 0,
      vendedor: userProfile.name || user.email
    };

    await setDoc(doc(db, 'empresas', empId, 'sales', saleId), newSale);
    for (const item of cart) {
      await setDoc(doc(db, 'empresas', empId, 'products', item.product.id), { stock: increment(-item.quantity) }, { merge: true });
    }
    setCurrentTicket({ id: saleId, ...newSale });
    setCart([]); 
    setSelectedCustomer(null);
    setPaymentMethod('efectivo'); 
    setSplitCash('');
    setSplitDigital('');
  };

  const saveDirectDebt = async (customerId, currentAmount) => {
    if (!userProfile?.empresaId) return;
    const montoNum = Number(currentAmount || 0);
    await setDoc(doc(db, 'empresas', userProfile.empresaId, 'customers', customerId), {
      hasDebt: montoNum > 0,
      debtAmount: montoNum
    }, { merge: true });
    alert("¡Deuda actualizada correctamente!");
  };

  // CAMBIO ON/OFF DE ESTADO DE EMPLEADO POR EL DUEÑO
  const toggleEmployeeStatus = async (employeeId, currentStatus) => {
    try {
      await setDoc(doc(db, 'users', employeeId), { activo: !currentStatus }, { merge: true });
    } catch (err) {
      alert("Error al actualizar el estado del empleado.");
    }
  };

  const handleWhatsApp = (ticket) => {
    let text = `*RECIBO DE VENTA*\n--------------------------\n`;
    text += `*Cliente:* ${ticket.customerName}\n*Fecha:* ${ticket.date}\n`;
    if (ticket.paymentMethod === 'combinado') {
      text += `*Método:* 🔄 Combinado (Efe: $${ticket.splitCash} | Virtual: $${ticket.splitDigital})\n\n`;
    } else {
      text += `*Método:* ${ticket.paymentMethod === 'virtual' || ticket.paymentMethod === 'digital' ? '📱 Virtual' : '💵 Efectivo'}\n\n`;
    }
    text += `*Detalle:*\n`;
    ticket.items.forEach(i => text += `• ${i.qty}x ${i.name} - $${(i.price * i.qty).toLocaleString()}\n`);
    text += `\n*TOTAL: $${ticket.total.toLocaleString()}*\n--------------------------\n¡Gracias por su compra!`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  };

  if (isCheckingAuth) return <div className="h-screen flex items-center justify-center bg-white text-violet-600 font-black">TALOAPP...</div>;

  if (!user) return (
    <div className="h-screen flex items-center justify-center bg-slate-100 p-4">
      <form onSubmit={handleLogin} className="bg-white p-10 rounded-[40px] shadow-2xl w-full max-w-sm text-center border border-slate-200">
        <h1 className="text-4xl font-black text-violet-600 mb-2">taloapp</h1>
        <p className="text-xs font-bold text-slate-400 mb-6">Punto de Venta para Comercios</p>
        <input type="email" placeholder="Correo electrónico" required className="w-full p-4 mb-3 rounded-2xl border border-slate-300 outline-none font-bold" value={email} onChange={e => setEmail(e.target.value)} />
        <input type="password" placeholder="Contraseña" required className="w-full p-4 mb-6 rounded-2xl border border-slate-300 outline-none font-bold" value={password} onChange={e => setPassword(e.target.value)} />
        {loginError && <p className="text-rose-500 mb-4 text-xs font-bold">{loginError}</p>}
        <button type="submit" className="w-full bg-violet-600 text-white font-black py-4 rounded-2xl shadow-lg hover:bg-violet-700 transition-all">INGRESAR AL LOCAL</button>
      </form>
    </div>
  );

  const isAdmin = userProfile?.rol === 'admin';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* MENÚ NAVEGACIÓN */}
      <nav className="border-b p-3 flex justify-between items-center sticky top-0 z-30 bg-white shadow-sm">
        <div className="flex gap-1 overflow-x-auto">
          <button onClick={() => setActiveTab('pos')} className={`px-4 py-2 rounded-xl font-bold flex items-center gap-2 ${activeTab === 'pos' ? 'bg-violet-600 text-white shadow-md' : 'text-slate-600'}`}><ShoppingCart size={18}/> Venta</button>
          <button onClick={() => setActiveTab('products')} className={`px-4 py-2 rounded-xl font-bold flex items-center gap-2 ${activeTab === 'products' ? 'bg-violet-600 text-white shadow-md' : 'text-slate-600'}`}><Package size={18}/> Stock</button>
          <button onClick={() => setActiveTab('customers')} className={`px-4 py-2 rounded-xl font-bold flex items-center gap-2 ${activeTab === 'customers' ? 'bg-violet-600 text-white shadow-md' : 'text-slate-600'}`}><Users size={18}/> Clientes</button>
          <button onClick={() => setActiveTab('vales')} className={`px-4 py-2 rounded-xl font-bold flex items-center gap-2 ${activeTab === 'vales' ? 'bg-violet-600 text-white shadow-md' : 'text-slate-600'}`}><Ticket size={18}/> Vales</button>
          
          {/* PESTAÑAS EXCLUSIVAS DEL ADMINISTRADOR / DUEÑO */}
          {isAdmin && (
            <>
              <button onClick={() => setActiveTab('reports')} className={`px-4 py-2 rounded-xl font-bold flex items-center gap-2 ${activeTab === 'reports' ? 'bg-violet-600 text-white shadow-md' : 'text-slate-600'}`}><FileText size={18}/> Informes</button>
              <button onClick={() => setActiveTab('team')} className={`px-4 py-2 rounded-xl font-bold flex items-center gap-2 ${activeTab === 'team' ? 'bg-violet-600 text-white shadow-md' : 'text-slate-600'}`}><Shield size={18}/> Mi Equipo</button>
            </>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-xs font-black text-slate-400 hidden sm:inline">{userProfile?.name || user.email} ({userProfile?.rol?.toUpperCase()})</span>
          <button onClick={() => signOut(auth)} className="text-rose-500 p-2 hover:bg-rose-50 rounded-xl" title="Cerrar Sesión"><LogOut /></button>
        </div>
      </nav>

      <main className="p-4 max-w-7xl mx-auto">
        {/* PESTAÑA VENTA */}
        {activeTab === 'pos' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8 space-y-4">
              <div className="relative w-full">
                <Search className="absolute left-4 top-3.5 text-slate-500" size={18} />
                <input type="text" placeholder="Buscar producto por nombre..." className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-slate-200 bg-white font-bold outline-none focus:border-violet-600 shadow-sm" value={productSearchQuery} onChange={e => setProductSearchQuery(e.target.value)} />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {filteredProducts.map(p => (
                  <button key={p.id} onClick={() => addToCart(p)} className="p-6 rounded-3xl border border-slate-200 bg-white text-left shadow-sm hover:scale-[1.02] transition-all">
                    <p className="font-bold text-lg text-slate-800 mb-1">{p.name}</p>
                    <p className="text-violet-600 font-black text-2xl">${p.price.toLocaleString()}</p>
                    <p className={`text-[10px] font-black mt-3 px-2 py-1 rounded-md inline-block ${p.stock <= 5 ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-500'}`}>STOCK: {p.stock}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* SECTOR TICKET */}
            <div className="lg:col-span-4 rounded-[32px] border border-slate-200 bg-white shadow-xl flex flex-col max-h-[90vh] overflow-hidden sticky top-24">
              <div className="p-5 border-b font-black text-teal-600 text-center uppercase tracking-widest bg-slate-50">Ticket</div>
              <div className="p-4 bg-white border-b space-y-3">
                <select className="w-full p-4 rounded-2xl border border-slate-200 bg-slate-50 font-bold text-sm outline-none" value={selectedCustomer?.id || ''} onChange={(e) => setSelectedCustomer(customers.find(c => c.id === e.target.value))}>
                  <option value="">Cliente General</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name} {c.hasDebt ? '⚠️ (DEBE)' : ''}</option>)}
                </select>

                <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1.5 rounded-2xl border">
                  <button type="button" onClick={() => setPaymentMethod('efectivo')} className={`py-2 rounded-xl font-black text-[10px] flex flex-col items-center justify-center transition-all ${paymentMethod === 'efectivo' ? 'bg-white text-slate-900 shadow-sm border' : 'text-slate-400'}`}><DollarSign size={12}/>Efectivo</button>
                  <button type="button" onClick={() => setPaymentMethod('digital')} className={`py-2 rounded-xl font-black text-[10px] flex flex-col items-center justify-center transition-all ${paymentMethod === 'digital' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-400'}`}><Smartphone size={12}/>Virtual</button>
                  <button type="button" onClick={() => setPaymentMethod('combinado')} className={`py-2 rounded-xl font-black text-[10px] flex flex-col items-center justify-center transition-all ${paymentMethod === 'combinado' ? 'bg-teal-500 text-white shadow-sm' : 'text-slate-400'}`}><Layers size={12}/>Combinado</button>
                </div>

                {paymentMethod === 'combinado' && (
                  <div className="p-3 bg-slate-50 border rounded-2xl space-y-2 transition-all">
                    <p className="text-[10px] font-black text-slate-400 uppercase text-center">Desglose de Pago Combinado</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-0.5">
                        <span className="text-[9px] font-black text-slate-500">Monto Efectivo $</span>
                        <input type="number" placeholder="Ej: 5000" className="w-full bg-white p-2 rounded-xl border text-xs font-black text-slate-800 outline-none" value={splitCash} onChange={e => setSplitCash(e.target.value)} />
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[9px] font-black text-slate-500">Monto Virtual $</span>
                        <input type="number" placeholder="Ej: 3000" className="w-full bg-white p-2 rounded-xl border text-xs font-black text-slate-800 outline-none" value={splitDigital} onChange={e => setSplitDigital(e.target.value)} />
                      </div>
                    </div>
                    {!isSplitTotalCorrect && (
                      <p className="text-[9px] text-rose-500 font-bold text-center flex items-center justify-center gap-1">
                        <AlertCircle size={10}/> La suma debe dar: ${cartTotal.toLocaleString()}
                      </p>
                    )}
                  </div>
                )}
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white">
                {cart.map(item => (
                  <div key={item.product.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 shadow-sm space-y-3">
                    <div className="flex justify-between font-black text-slate-800 text-sm">
                      <span>{item.product.name}</span>
                      <button onClick={() => setCart(cart.filter(i => i.product.id !== item.product.id))} className="text-rose-500 font-bold text-xs hover:underline">Quitar</button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-black text-slate-400 uppercase">Cant:</span>
                        <input type="number" min="1" value={item.quantity} onChange={(e) => updateCartQty(item.product.id, e.target.value)} className="w-full bg-white p-2 rounded-xl border border-slate-200 text-slate-900 font-black text-center outline-none" />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-black text-slate-400 uppercase">Precio $:</span>
                        <input type="number" value={item.unitPrice} onChange={(e) => updateCartPrice(item.product.id, e.target.value)} className="w-full bg-white p-2 rounded-xl border border-slate-200 text-slate-900 font-black text-teal-600 text-right outline-none" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-6 border-t border-slate-100 bg-white space-y-4">
                <div className="flex justify-between text-2xl font-black text-slate-800"><span>TOTAL:</span><span className="text-teal-600">${cartTotal.toLocaleString()}</span></div>
                <button 
                  onClick={handleCheckout} 
                  disabled={cart.length === 0 || !isSplitTotalCorrect} 
                  className="w-full bg-teal-500 hover:bg-teal-600 text-white py-4 rounded-2xl font-black shadow-lg disabled:opacity-30 uppercase tracking-wider text-xs"
                >
                  COBRAR ({paymentMethod === 'combinado' ? 'COMBINADO' : paymentMethod === 'digital' ? 'VIRTUAL' : 'EFECTIVO'})
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PESTAÑA STOCK */}
        {activeTab === 'products' && (
          <div className="max-w-4xl mx-auto space-y-4 pt-4">
            <div className="flex justify-end mb-4">
              <button onClick={() => {setEditingProduct(null); setProductForm({name:'', price:'', stock:''}); setIsProductModalOpen(true);}} className="bg-violet-600 text-white px-8 py-3 rounded-2xl font-black shadow-lg shadow-violet-600/20">+ NUEVO PRODUCTO</button>
            </div>
            <div className="grid gap-3">
              {products.map(p => (
                <div key={p.id} className="p-6 rounded-3xl border border-slate-200 bg-white flex justify-between items-center shadow-sm">
                  <div>
                    <p className="font-black text-xl text-slate-800">{p.name}</p>
                    <p className="text-teal-600 font-black text-lg">${p.price} <span className="text-slate-400 text-xs ml-2 font-bold">Stock Actual: {p.stock} unidades</span></p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => {setEditingProduct(p); setProductForm({name:p.name, price:p.price, stock:p.stock}); setIsProductModalOpen(true);}} className="p-3 text-violet-600 bg-violet-50 rounded-2xl"><Edit2 size={18}/></button>
                    {isAdmin && (
                      <button onClick={() => deleteDoc(doc(db, 'empresas', userProfile.empresaId, 'products', p.id))} className="p-3 text-rose-500 hover:bg-rose-50 rounded-2xl"><Trash2 size={18}/></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PESTAÑA CLIENTES */}
        {activeTab === 'customers' && (
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
              <div className="relative w-full sm:max-w-md">
                <Search className="absolute left-4 top-3.5 text-slate-400" size={18} />
                <input type="text" placeholder="Buscar cliente por nombre..." className="w-full pl-12 pr-4 py-3 rounded-2xl border border-slate-200 bg-white font-bold outline-none focus:border-violet-600 shadow-sm" value={customerSearchQuery} onChange={e => setCustomerSearchQuery(e.target.value)} />
              </div>
              <button onClick={() => {setCustomerForm({name:'', phone:'', hasDebt:false, debtAmount:''}); setIsCustomerModalOpen(true);}} className="bg-violet-600 text-white px-6 py-3 rounded-2xl font-black shadow-lg w-full sm:w-auto">+ NUEVO CLIENTE</button>
            </div>

            <div className="grid gap-3">
              {filteredCustomers.map(c => {
                const totalSpent = sales.filter(s => s.customerName === c.name).reduce((sum, s) => sum + s.total, 0);
                const currentDebtInputVal = editingDebts[c.id] !== undefined ? editingDebts[c.id] : (c.debtAmount || 0);

                return (
                  <div key={c.id} className={`p-6 rounded-3xl border transition-all bg-white flex flex-col md:flex-row md:justify-between md:items-center gap-4 shadow-sm ${c.hasDebt ? 'border-rose-500 ring-2 ring-rose-500/10 bg-rose-50/10' : 'border-slate-200'}`}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-black text-xl text-slate-800">{c.name}</p>
                        {c.hasDebt && <span className="bg-rose-500 text-white text-[10px] font-black px-2 py-0.5 rounded-md flex items-center gap-1"><AlertCircle size={10}/> CUENTA CON DEUDA</span>}
                      </div>
                      <p className="text-slate-500 font-bold text-xs mb-2"><Phone size={12} className="inline mr-1"/> {c.phone || 'Sin Teléfono'}</p>
                      <span className="text-[11px] font-black px-2 py-1 bg-teal-50 text-teal-600 rounded-md">Total Comprado: ${totalSpent.toLocaleString()}</span>
                    </div>

                    <div className="bg-slate-100 p-3 rounded-2xl border flex items-center gap-2 w-full md:w-auto">
                      <span className="text-xs font-black text-slate-500 uppercase pl-1">Debe $:</span>
                      <input 
                        type="number" 
                        value={currentDebtInputVal} 
                        onChange={(e) => setEditingDebts({ ...editingDebts, [c.id]: e.target.value })}
                        className="w-24 bg-white p-2 rounded-xl border text-center font-black text-rose-600 outline-none shadow-inner"
                      />
                      <button 
                        onClick={() => saveDirectDebt(c.id, currentDebtInputVal)}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-2 rounded-xl font-black text-xs flex items-center gap-1 shadow-sm"
                      >
                        <Check size={14}/> Guardar
                      </button>
                    </div>

                    <div className="flex gap-2 self-end md:self-center">
                      <button onClick={() => setViewingCustomerHistory(c)} className="px-4 py-2 text-violet-600 bg-violet-50 font-black rounded-xl text-xs flex items-center gap-2"><Eye size={14}/> HISTORIAL</button>
                      {isAdmin && (
                        <button onClick={() => deleteDoc(doc(db, 'empresas', userProfile.empresaId, 'customers', c.id))} className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl"><Trash2 size={16}/></button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* PESTAÑA VALES */}
        {activeTab === 'vales' && (
          <div className="max-w-4xl mx-auto space-y-4 pt-4">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-2xl font-black text-slate-800">Control de Vales / Vacíos</h2>
                <p className="text-xs text-slate-400 font-bold">Análisis de envases, cajones o bultos prestados a clientes</p>
              </div>
              <button onClick={() => { setValeForm({ customerName: '', vaciosDebidos: '', entregó: '', yaPago: false }); setIsValeModalOpen(true); }} className="bg-violet-600 text-white px-6 py-3 rounded-2xl font-black shadow-lg">+ NUEVO VALE</button>
            </div>

            <div className="grid gap-3">
              {vales.map(v => (
                <div key={v.id} className={`p-6 rounded-3xl border bg-white flex justify-between items-center shadow-sm ${v.yaPago ? 'border-slate-200 opacity-60' : 'border-amber-400 ring-2 ring-amber-400/10'}`}>
                  <div>
                    <p className="font-black text-xl text-slate-800 uppercase">{v.customerName}</p>
                    <div className="flex gap-3 mt-1.5 text-xs font-black">
                      <span className="px-2 py-1 rounded-md bg-rose-50 text-rose-600">Debía: {v.vaciosDebidos} vacíos</span>
                      <span className="px-2 py-1 rounded-md bg-teal-50 text-teal-600">Entregó: {v.entregó}</span>
                      <span className={`px-2 py-1 rounded-md ${v.yaPago ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {v.yaPago ? '✅ SALDADO' : '⚠️ PENDIENTE'}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2 font-bold">Fecha: {v.date || 'Reciente'}</p>
                  </div>
                  {isAdmin && (
                    <button onClick={() => deleteDoc(doc(db, 'empresas', userProfile.empresaId, 'vales', v.id))} className="p-3 text-rose-500 hover:bg-rose-50 rounded-2xl">
                      <Trash2 size={18}/>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PESTAÑA INFORMES DE VENTAS (EXCLUSIVA DUEÑO/ADMIN) */}
        {activeTab === 'reports' && isAdmin && (
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-6 bg-slate-900 text-white rounded-[32px] shadow-lg relative overflow-hidden">
                <p className="text-[11px] font-black uppercase tracking-wider opacity-60">
                  {reportStats.isToday ? 'Ventas Totales de Hoy 💰' : 'Ventas Totales del Día 💰'}
                </p>
                <p className="text-3xl font-black mt-1">${reportStats.calendarRevenue.toLocaleString()}</p>
                <p className="text-[11px] font-bold mt-3 opacity-80">{reportStats.calendarCount} Facturas hechas</p>
              </div>

              <div className="p-6 bg-emerald-600 text-white rounded-[32px] shadow-lg relative overflow-hidden">
                <p className="text-[11px] font-black uppercase tracking-wider opacity-70"> Caja en Efectivo 💵</p>
                <p className="text-3xl font-black mt-1">${reportStats.calendarCash.toLocaleString()}</p>
                <p className="text-[11px] font-bold mt-3 opacity-90">Plata física esperada en caja</p>
              </div>

              <div className="p-6 bg-violet-600 text-white rounded-[32px] shadow-lg relative overflow-hidden">
                <p className="text-[11px] font-black uppercase tracking-wider opacity-70">Caja Virtual / Digital 📱</p>
                <p className="text-3xl font-black mt-1">${reportStats.calendarDigital.toLocaleString()}</p>
                <p className="text-[11px] font-bold mt-3 opacity-90">Bancos / Mercado Pago</p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
                <div className="flex items-center gap-2">
                  <Search className="text-slate-900" size={20}/>
                  <div>
                    <h3 className="font-black text-xl text-slate-800">Calendario</h3>
                    <p className="text-xs text-slate-400 font-bold">Seleccioná un día del almanaque para ver qué se vendió</p>
                  </div>
                </div>
                <input type="date" value={selectedReportDate} onChange={e => setSelectedReportDate(e.target.value)} className="p-3 rounded-xl border border-slate-300 font-bold text-slate-700 outline-none bg-slate-50 shadow-inner w-full sm:w-auto" />
              </div>

              <div className="space-y-3 pt-2">
                <div className="flex justify-between items-center px-2">
                  <span className="font-black text-sm text-slate-500 uppercase">Movimientos del día:</span>
                  <span className="font-black text-teal-600 bg-teal-50 px-3 py-1 rounded-xl text-sm">Total: ${reportStats.calendarRevenue.toLocaleString()}</span>
                </div>
                {reportStats.calendarSales.map(s => (
                  <div key={s.id} className="p-5 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                      <div className="size-10 rounded-xl bg-violet-100 flex items-center justify-center font-black text-violet-600 text-xs italic">T</div>
                      <div>
                        <p className="font-black text-slate-800">{s.customerName}</p>
                        <p className="text-[10px] font-bold text-slate-400">
                          {s.date} • <span className="font-black text-violet-600 uppercase">
                            {s.paymentMethod === 'combinado' ? `🔄 COMBINADO (Efe: $${s.splitCash} | Virtual: $${s.splitDigital})` : s.paymentMethod === 'virtual' || s.paymentMethod === 'digital' ? '📱 Virtual' : '💵 Efectivo'}
                          </span>
                        </p>
                      </div>
                    </div>
                    <span className="font-black text-slate-700 text-lg">${s.total.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* PESTAÑA MI EQUIPO (EXCLUSIVA DUEÑO/ADMIN CON CONTROL INTERRUPTOR ON/OFF) */}
        {activeTab === 'team' && isAdmin && (
          <div className="max-w-4xl mx-auto space-y-4 pt-4">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-2xl font-black text-slate-800">Personal del Local</h2>
                <p className="text-xs text-slate-400 font-bold">Gestioná los accesos de tus empleados a la app</p>
              </div>
              <button 
                onClick={() => { setTeamForm({ name: '', email: '', password: '' }); setIsTeamModalOpen(true); }} 
                className="bg-violet-600 text-white px-6 py-3 rounded-2xl font-black shadow-lg"
              >
                + NUEVO EMPLEADO
              </button>
            </div>

            <div className="grid gap-3">
              {teamMembers.map(member => (
                <div key={member.id} className="p-6 rounded-3xl border border-slate-200 bg-white flex justify-between items-center shadow-sm">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-black text-xl text-slate-800">{member.name || member.email}</p>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${member.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                        {member.activo ? 'ACTIVO' : 'INHABILITADO'}
                      </span>
                    </div>
                    <p className="text-slate-400 font-bold text-xs">{member.email}</p>
                  </div>

                  {/* INTERRUPTOR ON / OFF */}
                  <button 
                    onClick={() => toggleEmployeeStatus(member.id, member.activo)}
                    className={`px-4 py-2 rounded-2xl font-black text-xs flex items-center gap-2 transition-all ${member.activo ? 'bg-rose-50 text-rose-600 hover:bg-rose-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}
                  >
                    {member.activo ? (
                      <><UserX size={16}/> DESACTIVAR</>
                    ) : (
                      <><UserCheck size={16}/> ACTIVAR ACCESO</>
                    )}
                  </button>
                </div>
              ))}
              {teamMembers.length === 0 && (
                <div className="text-center p-12 bg-white rounded-3xl border text-slate-400 font-bold">
                  No hay otros empleados registrados para esta empresa todavía.
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* MODAL NUEVO PRODUCTO */}
      {isProductModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form onSubmit={async (e) => {
            e.preventDefault();
            try {
              const productId = editingProduct?.id ? String(editingProduct.id) : String(Date.now());
              await setDoc(doc(db, 'empresas', userProfile.empresaId, 'products', productId), { 
                name: productForm.name.trim(), 
                price: Number(productForm.price || 0), 
                stock: Number(productForm.stock || 0) 
              });
              setProductForm({ name: '', price: '', stock: '' });
              setEditingProduct(null);
              setIsProductModalOpen(false);
            } catch (err) {
              alert("Error al guardar producto: " + err.message);
            }
          }} className="bg-white p-8 rounded-[40px] w-full max-w-sm space-y-4 shadow-2xl border border-slate-100">
            <h2 className="text-2xl font-black text-slate-800 italic">{editingProduct ? 'Modificar Producto' : 'Nuevo Producto'}</h2>
            <input required placeholder="Nombre del producto" className="w-full p-4 rounded-2xl border border-slate-200 font-bold outline-none" value={productForm.name} onChange={e => setProductForm({...productForm, name: e.target.value})} />
            <div className="grid grid-cols-2 gap-4">
              <input required type="number" placeholder="Precio $" className="w-full p-4 rounded-2xl border border-slate-200 font-bold outline-none" value={productForm.price} onChange={e => setProductForm({...productForm, price: e.target.value})} />
              <input required type="number" placeholder="Cantidad" className="w-full p-4 rounded-2xl border border-slate-200 font-bold outline-none" value={productForm.stock} onChange={e => setProductForm({...productForm, stock: e.target.value})} />
            </div>
            <button type="submit" className="w-full bg-violet-600 text-white py-5 rounded-2xl font-black shadow-xl">{editingProduct ? 'ACTUALIZAR DATOS' : 'GUARDAR PRODUCTO'}</button>
            <button type="button" onClick={() => setIsProductModalOpen(false)} className="w-full py-2 font-bold text-slate-400">Cancelar</button>
          </form>
        </div>
      )}

      {/* MODAL NUEVO VALE */}
      {isValeModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form onSubmit={async (e) => {
            e.preventDefault();
            const id = Date.now().toString();
            await setDoc(doc(db, 'empresas', userProfile.empresaId, 'vales', id), {
              customerName: valeForm.customerName,
              vaciosDebidos: Number(valeForm.vaciosDebidos || 0),
              entregó: Number(valeForm.entregó || 0),
              yaPago: valeForm.yaPago,
              timestamp: Date.now(),
              date: new Date().toLocaleDateString()
            });
            setIsValeModalOpen(false);
          }} className="bg-white p-8 rounded-[40px] w-full max-w-sm space-y-4 shadow-2xl border border-slate-100">
            <h2 className="text-2xl font-black text-slate-800 italic">Registrar Vale / Vacíos</h2>
            
            <div className="space-y-1">
              <label className="text-xs font-black text-slate-400 uppercase">Seleccionar Cliente:</label>
              <select required className="w-full p-4 rounded-2xl border border-slate-200 bg-slate-50 font-bold text-sm outline-none" value={valeForm.customerName} onChange={e => setValeForm({...valeForm, customerName: e.target.value})}>
                <option value="">-- Elegir Cliente --</option>
                {customers.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-black text-slate-400 uppercase">¿Cuánto debe?:</label>
                <input required type="number" placeholder="Cant. vacíos" className="w-full p-4 rounded-2xl border border-slate-200 font-bold outline-none" value={valeForm.vaciosDebidos} onChange={e => setValeForm({...valeForm, vaciosDebidos: e.target.value})} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-black text-slate-400 uppercase">¿Entregó algo?:</label>
                <input required type="number" placeholder="Cant. entregada" className="w-full p-4 rounded-2xl border border-slate-200 font-bold outline-none" value={valeForm.entregó} onChange={e => setValeForm({...valeForm, entregó: e.target.value})} />
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
              <label className="flex items-center gap-2 cursor-pointer font-bold text-sm text-slate-700">
                <input type="checkbox" checked={valeForm.yaPago} onChange={e => setValeForm({...valeForm, yaPago: e.target.checked})} className="size-4 accent-violet-600" />
                <span>¿Este vale ya fue saldado?</span>
              </label>
            </div>

            <button type="submit" className="w-full bg-violet-600 text-white py-5 rounded-2xl font-black shadow-xl">GUARDAR VALE</button>
            <button type="button" onClick={() => setIsValeModalOpen(false)} className="w-full py-2 font-bold text-slate-400">Cancelar</button>
          </form>
        </div>
      )}

      {/* MODAL NUEVO CLIENTE */}
      {isCustomerModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form onSubmit={async (e) => {
            e.preventDefault();
            try {
              const id = Date.now().toString();
              await setDoc(doc(db, 'empresas', userProfile.empresaId, 'customers', id), { 
                name: customerForm.name.trim(), 
                phone: customerForm.phone || '',
                hasDebt: customerForm.hasDebt,
                debtAmount: customerForm.hasDebt ? Number(customerForm.debtAmount) : 0
              });
              setCustomerForm({ name: '', phone: '', hasDebt: false, debtAmount: '' });
              setIsCustomerModalOpen(false);
            } catch (err) {
              alert("Error al guardar cliente: " + err.message);
            }
          }} className="bg-white p-8 rounded-[40px] w-full max-w-sm space-y-4 shadow-2xl border border-slate-100">
            <h2 className="text-2xl font-black text-slate-800 italic">Registrar Cliente</h2>
            <input required type="text" placeholder="Nombre completo" className="w-full p-4 rounded-2xl border border-slate-200 font-bold outline-none" value={customerForm.name} onChange={e => setCustomerForm({...customerForm, name: e.target.value})} />
            <input type="text" placeholder="WhatsApp / Teléfono" className="w-full p-4 rounded-2xl border border-slate-200 font-bold outline-none" value={customerForm.phone} onChange={e => setCustomerForm({...customerForm, phone: e.target.value})} />
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer font-bold text-sm text-slate-700">
                <input type="checkbox" checked={customerForm.hasDebt} onChange={e => setCustomerForm({...customerForm, hasDebt: e.target.checked})} className="size-4 accent-violet-600" />
                <span>¿Este cliente tiene saldo deudor?</span>
              </label>
              {customerForm.hasDebt && (
                <input required type="number" placeholder="Monto que debe $" className="w-full p-3 rounded-xl border border-slate-300 font-black text-rose-600 outline-none" value={customerForm.debtAmount} onChange={e => setCustomerForm({...customerForm, debtAmount: e.target.value})} />
              )}
            </div>
            <button type="submit" className="w-full bg-violet-600 text-white py-5 rounded-2xl font-black shadow-xl">GUARDAR DATOS</button>
            <button type="button" onClick={() => setIsCustomerModalOpen(false)} className="w-full py-2 font-bold text-slate-400">Cerrar</button>
          </form>
        </div>
      )}

      {/* MODAL NUEVO EMPLEADO */}
      {isTeamModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form onSubmit={async (e) => {
            e.preventDefault();
            try {
              // Instancia de Auth secundaria para no desloguear al dueño actual
              const tempApp = initializeApp(firebaseConfig, "SecondaryAuthApp");
              const tempAuth = getAuth(tempApp);
              
              const res = await createUserWithEmailAndPassword(tempAuth, teamForm.email.trim(), teamForm.password);
              const newUid = res.user.uid;

              // Guardamos su perfil asociado a la empresaId del dueño logueado
              await setDoc(doc(db, 'users', newUid), {
                name: teamForm.name.trim(),
                email: teamForm.email.trim(),
                empresaId: userProfile.empresaId,
                rol: 'empleado',
                activo: true
              });

              setIsTeamModalOpen(false);
              setTeamForm({ name: '', email: '', password: '' });
              alert("¡Empleado registrado con éxito!");
            } catch (err) {
              alert("Error al registrar empleado: " + err.message);
            }
          }} className="bg-white p-8 rounded-[40px] w-full max-w-sm space-y-4 shadow-2xl border border-slate-100">
            <h2 className="text-2xl font-black text-slate-800 italic">Nuevo Empleado</h2>
            <input required type="text" placeholder="Nombre completo" className="w-full p-4 rounded-2xl border border-slate-200 font-bold outline-none" value={teamForm.name} onChange={e => setTeamForm({...teamForm, name: e.target.value})} />
            <input required type="email" placeholder="Correo electrónico" className="w-full p-4 rounded-2xl border border-slate-200 font-bold outline-none" value={teamForm.email} onChange={e => setTeamForm({...teamForm, email: e.target.value})} />
            <input required type="password" placeholder="Contraseña de acceso" className="w-full p-4 rounded-2xl border border-slate-200 font-bold outline-none" value={teamForm.password} onChange={e => setTeamForm({...teamForm, password: e.target.value})} />
            
            <button type="submit" className="w-full bg-violet-600 text-white py-5 rounded-2xl font-black shadow-xl">CREAR EMPLEADO</button>
            <button type="button" onClick={() => setIsTeamModalOpen(false)} className="w-full py-2 font-bold text-slate-400">Cancelar</button>
          </form>
        </div>
      )}

      {/* HISTORIAL Y TICKET VISTA */}
      {viewingCustomerHistory && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white p-6 rounded-[40px] w-full max-w-md max-h-[85vh] flex flex-col shadow-2xl border border-slate-100">
            <div className="border-b pb-3 mb-4">
              <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">{viewingCustomerHistory.name}</h3>
              <p className="text-xs text-slate-400 font-bold">Historial cronológico completo de compras</p>
            </div>
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {sales.filter(s => s.customerName === viewingCustomerHistory.name).map(ticket => (
                <div key={ticket.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200/60 font-mono text-xs text-slate-800">
                  <div className="flex-col justify-between font-black border-b border-dashed border-slate-300 pb-2 mb-2">
                    <div className="flex justify-between">
                      <span>📅 {ticket.date.split(',')[0]}</span>
                      <span>💰 Total: ${ticket.total.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="space-y-1 opacity-90">
                    {ticket.items?.map((item, i) => (
                      <div key={i} className="flex justify-between">
                        <span>{item.qty}x {item.name}</span>
                        <span>${(item.price * item.qty).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setViewingCustomerHistory(null)} className="w-full mt-4 bg-slate-900 text-white font-black py-4 rounded-2xl">CERRAR HISTORIAL</button>
          </div>
        </div>
      )}

      {currentTicket && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white p-8 rounded-[40px] w-full max-w-xs text-center font-mono shadow-2xl border-2 border-slate-100">
            <h3 className="font-black text-violet-600 italic text-xl mb-4">TALO TICKET</h3>
            <div className="border-y border-dashed border-slate-300 py-6 my-4 space-y-1 text-slate-900 text-left">
              <p className="font-black text-lg uppercase mb-2">{currentTicket.customerName}</p>
              <p className="text-[10px] font-bold opacity-60 mb-6">{currentTicket.date}</p>
              <div className="space-y-2">
                {currentTicket.items.map((i, idx) => (
                  <div key={idx} className="flex justify-between text-xs font-bold border-b border-slate-50 pb-1">
                    <span>{i.qty} x {i.name}</span>
                    <span>${(i.price * i.qty).toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div className="pt-6 mt-6 border-t-2 border-dashed border-slate-300 flex justify-between font-black text-2xl text-teal-600">
                <span>TOTAL:</span><span>${currentTicket.total.toLocaleString()}</span>
              </div>
            </div>
            <div className="space-y-3">
              <button onClick={() => window.print()} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black shadow-lg">IMPRIMIR</button>
              <button onClick={() => handleWhatsApp(currentTicket)} className="w-full bg-[#25D366] text-white py-4 rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg"><Phone size={18}/> WHATSAPP</button>
              <button onClick={() => setCurrentTicket(null)} className="w-full py-2 font-black text-slate-400 underline">CERRAR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 