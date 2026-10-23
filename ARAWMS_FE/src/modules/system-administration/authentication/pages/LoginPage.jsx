import LoginBrandPanel from '../components/LoginBrandPanel';
import LoginForm from '../components/LoginForm';
import '../../systemAdministration.css';

export default function LoginPage() {
  return <div className="ara-login-page"><div className="ara-login-card">
    <LoginBrandPanel /><LoginForm />
  </div></div>;
}
