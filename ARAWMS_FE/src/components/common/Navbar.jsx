/* Người thực hiện: Nguyễn Ngọc Huy-HE171157 | Ngày: 30-10-2026 | Thanh điều hướng gọn cho trang chung. */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Avatar, Button, Dropdown } from 'antd';
import { LogOut, User as UserIcon } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
export default function Navbar() {
  const {user,logout}=useAuth();const navigate=useNavigate();const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const signOut=async()=>{setBusy(true);setError('');try{await logout();navigate('/login',{replace:true});}catch(err){setError(err.message);}finally{setBusy(false);}};
  const menu={items:[{key:'profile',label:'Tài khoản & bảo mật',icon:<UserIcon size={16}/>,onClick:()=>navigate(user?.roleCode==='OWNER'?'/owner/account':'/account')},{type:'divider'},{key:'logout',label:busy?'Đang đăng xuất…':'Đăng xuất',danger:true,disabled:busy,icon:<LogOut size={16}/>,onClick:signOut}]};
  return <><header className="ara-navbar"><Link to="/" className="ara-brand"><img src="/logo.png" alt="" className="ara-brand-logo"/><span><strong className="ara-brand-text">AraStore</strong><small className="ara-brand-subtitle">Quản lý kho & xưởng may</small></span></Link>
    <nav aria-label="Điều hướng chung"><ul className="ara-nav-links">{user?<><li><Link to="/">Trang chủ</Link></li><li><Dropdown menu={menu} trigger={['click']}><Button type="text" className="ara-profile-button" aria-label="Mở menu tài khoản"><Avatar size={28}>{user.fullName?.[0]||'U'}</Avatar><span className="ara-profile-name">{user.fullName||user.employeeCode}</span></Button></Dropdown></li></>:<li><span className="ara-brand-subtitle">Cổng truy cập nội bộ</span></li>}</ul></nav>
  </header>{error&&<div role="alert" className="ara-logout-error">{error}</div>}</>;
}
