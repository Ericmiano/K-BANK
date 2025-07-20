import React, { useState, useEffect, createContext, useContext } from 'react';
import './App.css';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Auth Context
const AuthContext = createContext();

const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [token]);

  const fetchUser = async () => {
    try {
      const response = await axios.get(`${API}/auth/me`);
      setUser(response.data);
    } catch (error) {
      console.error('Error fetching user:', error);
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      const response = await axios.post(`${API}/auth/login`, { email, password });
      const { access_token } = response.data;
      localStorage.setItem('token', access_token);
      setToken(access_token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      return true;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  const register = async (userData) => {
    try {
      await axios.post(`${API}/auth/register`, userData);
      return await login(userData.email, userData.password);
    } catch (error) {
      console.error('Registration error:', error);
      return false;
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    delete axios.defaults.headers.common['Authorization'];
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

// Theme Context
const ThemeContext = createContext();

const ThemeProvider = ({ children }) => {
  const [isDark, setIsDark] = useState(false);

  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle('dark');
  };

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme }}>
      <div className={isDark ? 'dark' : ''}>{children}</div>
    </ThemeContext.Provider>
  );
};

const useTheme = () => useContext(ThemeContext);

// Components
const LandingPage = ({ onShowAuth }) => {
  const { toggleTheme, isDark } = useTheme();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 transition-colors">
      {/* Navigation */}
      <nav className="flex justify-between items-center p-6 max-w-7xl mx-auto">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold">KB</span>
          </div>
          <span className="text-2xl font-bold text-gray-800 dark:text-white">KenyaBank</span>
        </div>
        
        <div className="flex items-center space-x-4">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            {isDark ? '🌞' : '🌙'}
          </button>
          <button
            onClick={() => onShowAuth('login')}
            className="px-4 py-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Login
          </button>
          <button
            onClick={() => onShowAuth('register')}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Get Started
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-8">
            <h1 className="text-5xl lg:text-6xl font-bold text-gray-800 dark:text-white leading-tight">
              Banking Made
              <span className="text-blue-600 block">Simple & Secure</span>
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-300 leading-relaxed">
              Experience the future of banking with KenyaBank. Send money via M-Pesa, manage your accounts, and bank securely from anywhere in Kenya.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={() => onShowAuth('register')}
                className="px-8 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all transform hover:scale-105 font-semibold text-lg"
              >
                Open Account Now
              </button>
              <button className="px-8 py-4 border-2 border-blue-600 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors font-semibold text-lg">
                Learn More
              </button>
            </div>
          </div>
          
          <div className="relative">
            <img 
              src="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDJ8MHwxfHNlYXJjaHwxfHxmaW5hbmNpYWx8ZW58MHx8fHwxNzUzMDE2NjMxfDA&ixlib=rb-4.1.0&q=85"
              alt="Financial district"
              className="rounded-2xl shadow-2xl w-full h-96 object-cover"
            />
            <div className="absolute -bottom-6 -left-6 bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                  <span className="text-green-600 dark:text-green-400 text-xl">✓</span>
                </div>
                <div>
                  <p className="font-semibold text-gray-800 dark:text-white">Secure Banking</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">256-bit SSL encryption</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section className="bg-white dark:bg-gray-800 py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-800 dark:text-white mb-4">
              Our Banking Services
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              Everything you need for modern banking in Kenya
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* M-Pesa Integration */}
            <div className="bg-gradient-to-br from-green-50 to-emerald-100 dark:from-gray-700 dark:to-gray-600 p-8 rounded-2xl hover:shadow-xl transition-all transform hover:-translate-y-2">
              <div className="w-16 h-16 bg-green-600 rounded-xl flex items-center justify-center mb-6">
                <img 
                  src="https://images.unsplash.com/photo-1537724326059-2ea20251b9c8?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1ODB8MHwxfHNlYXJjaHwyfHxiYW5raW5nfGVufDB8fHx8MTc1MzAxNjYyM3ww&ixlib=rb-4.1.0&q=85"
                  alt="M-Pesa"
                  className="w-8 h-8 object-cover rounded"
                />
              </div>
              <h3 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">M-Pesa Integration</h3>
              <p className="text-gray-600 dark:text-gray-300 mb-6">
                Seamlessly deposit and withdraw money using M-Pesa. Send money to any M-Pesa number directly from your bank account.
              </p>
              <ul className="space-y-2 text-gray-600 dark:text-gray-300">
                <li className="flex items-center"><span className="text-green-600 mr-2">✓</span>Instant deposits</li>
                <li className="flex items-center"><span className="text-green-600 mr-2">✓</span>Fast withdrawals</li>
                <li className="flex items-center"><span className="text-green-600 mr-2">✓</span>Low transaction fees</li>
              </ul>
            </div>

            {/* Online Banking */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-700 dark:to-gray-600 p-8 rounded-2xl hover:shadow-xl transition-all transform hover:-translate-y-2">
              <div className="w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center mb-6">
                <img 
                  src="https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDJ8MHwxfHNlYXJjaHwzfHxmaW5hbmNpYWx8ZW58MHx8fHwxNzUzMDE2NjMxfDA&ixlib=rb-4.1.0&q=85"
                  alt="Online Banking"
                  className="w-8 h-8 object-cover rounded"
                />
              </div>
              <h3 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">Online Banking</h3>
              <p className="text-gray-600 dark:text-gray-300 mb-6">
                Manage your accounts, transfer money, and track expenses from anywhere, anytime with our secure online platform.
              </p>
              <ul className="space-y-2 text-gray-600 dark:text-gray-300">
                <li className="flex items-center"><span className="text-blue-600 mr-2">✓</span>24/7 account access</li>
                <li className="flex items-center"><span className="text-blue-600 mr-2">✓</span>Real-time notifications</li>
                <li className="flex items-center"><span className="text-blue-600 mr-2">✓</span>Secure transactions</li>
              </ul>
            </div>

            {/* ATM Services */}
            <div className="bg-gradient-to-br from-purple-50 to-pink-100 dark:from-gray-700 dark:to-gray-600 p-8 rounded-2xl hover:shadow-xl transition-all transform hover:-translate-y-2">
              <div className="w-16 h-16 bg-purple-600 rounded-xl flex items-center justify-center mb-6">
                <img 
                  src="https://images.unsplash.com/photo-1601597111158-2fceff292cdc?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1ODB8MHwxfHNlYXJjaHwzfHxiYW5raW5nfGVufDB8fHx8MTc1MzAxNjYyM3ww&ixlib=rb-4.1.0&q=85"
                  alt="ATM Services"
                  className="w-8 h-8 object-cover rounded"
                />
              </div>
              <h3 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">ATM Network</h3>
              <p className="text-gray-600 dark:text-gray-300 mb-6">
                Access your money at over 1,000 ATMs across Kenya. Withdraw cash, check balances, and more.
              </p>
              <ul className="space-y-2 text-gray-600 dark:text-gray-300">
                <li className="flex items-center"><span className="text-purple-600 mr-2">✓</span>Nationwide network</li>
                <li className="flex items-center"><span className="text-purple-600 mr-2">✓</span>Free withdrawals</li>
                <li className="flex items-center"><span className="text-purple-600 mr-2">✓</span>Mini statements</li>
              </ul>
            </div>

            {/* Business Banking */}
            <div className="bg-gradient-to-br from-orange-50 to-red-100 dark:from-gray-700 dark:to-gray-600 p-8 rounded-2xl hover:shadow-xl transition-all transform hover:-translate-y-2">
              <div className="w-16 h-16 bg-orange-600 rounded-xl flex items-center justify-center mb-6">
                <span className="text-white text-2xl">💼</span>
              </div>
              <h3 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">Business Banking</h3>
              <p className="text-gray-600 dark:text-gray-300 mb-6">
                Specialized banking solutions for small and medium businesses. Manage payroll, accept payments, and grow your business.
              </p>
              <ul className="space-y-2 text-gray-600 dark:text-gray-300">
                <li className="flex items-center"><span className="text-orange-600 mr-2">✓</span>Business accounts</li>
                <li className="flex items-center"><span className="text-orange-600 mr-2">✓</span>Payment processing</li>
                <li className="flex items-center"><span className="text-orange-600 mr-2">✓</span>Business loans</li>
              </ul>
            </div>

            {/* Mobile Banking */}
            <div className="bg-gradient-to-br from-teal-50 to-cyan-100 dark:from-gray-700 dark:to-gray-600 p-8 rounded-2xl hover:shadow-xl transition-all transform hover:-translate-y-2">
              <div className="w-16 h-16 bg-teal-600 rounded-xl flex items-center justify-center mb-6">
                <span className="text-white text-2xl">📱</span>
              </div>
              <h3 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">Mobile Banking</h3>
              <p className="text-gray-600 dark:text-gray-300 mb-6">
                Bank on the go with our responsive mobile platform. Send money, pay bills, and manage accounts from your phone.
              </p>
              <ul className="space-y-2 text-gray-600 dark:text-gray-300">
                <li className="flex items-center"><span className="text-teal-600 mr-2">✓</span>Mobile-first design</li>
                <li className="flex items-center"><span className="text-teal-600 mr-2">✓</span>Touch ID/Face ID</li>
                <li className="flex items-center"><span className="text-teal-600 mr-2">✓</span>Quick transfers</li>
              </ul>
            </div>

            {/* Customer Support */}
            <div className="bg-gradient-to-br from-gray-50 to-slate-100 dark:from-gray-700 dark:to-gray-600 p-8 rounded-2xl hover:shadow-xl transition-all transform hover:-translate-y-2">
              <div className="w-16 h-16 bg-gray-600 rounded-xl flex items-center justify-center mb-6">
                <span className="text-white text-2xl">🎧</span>
              </div>
              <h3 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">24/7 Support</h3>
              <p className="text-gray-600 dark:text-gray-300 mb-6">
                Get help whenever you need it. Our customer support team is available around the clock to assist you.
              </p>
              <ul className="space-y-2 text-gray-600 dark:text-gray-300">
                <li className="flex items-center"><span className="text-gray-600 mr-2">✓</span>Phone support</li>
                <li className="flex items-center"><span className="text-gray-600 mr-2">✓</span>Live chat</li>
                <li className="flex items-center"><span className="text-gray-600 mr-2">✓</span>Email assistance</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-blue-600 py-20">
        <div className="max-w-4xl mx-auto text-center px-6">
          <h2 className="text-4xl font-bold text-white mb-6">
            Ready to Start Banking with Us?
          </h2>
          <p className="text-xl text-blue-100 mb-8">
            Join thousands of Kenyans who trust KenyaBank for their financial needs. Open your account in minutes.
          </p>
          <button
            onClick={() => onShowAuth('register')}
            className="px-8 py-4 bg-white text-blue-600 rounded-lg hover:bg-gray-50 transition-colors font-semibold text-lg transform hover:scale-105"
          >
            Open Your Account Today
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-800 text-white py-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold">KB</span>
                </div>
                <span className="text-xl font-bold">KenyaBank</span>
              </div>
              <p className="text-gray-400">
                Your trusted banking partner in Kenya. Secure, reliable, and always here for you.
              </p>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Services</h4>
              <ul className="space-y-2 text-gray-400">
                <li>Personal Banking</li>
                <li>Business Banking</li>
                <li>M-Pesa Integration</li>
                <li>Online Banking</li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Support</h4>
              <ul className="space-y-2 text-gray-400">
                <li>Help Center</li>
                <li>Contact Us</li>
                <li>Security Center</li>
                <li>Terms & Conditions</li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Contact</h4>
              <ul className="space-y-2 text-gray-400">
                <li>📞 +254 700 000 000</li>
                <li>📧 hello@kenyabank.co.ke</li>
                <li>📍 Nairobi, Kenya</li>
                <li>🕒 24/7 Support</li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-700 mt-12 pt-8 text-center text-gray-400">
            <p>&copy; 2024 KenyaBank. All rights reserved. Licensed by Central Bank of Kenya.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

const AuthModal = ({ mode, onClose, onSwitchMode }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    phone: '',
    role: 'customer'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login, register } = useAuth();
  const { isDark } = useTheme();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (mode === 'login') {
        const success = await login(formData.email, formData.password);
        if (!success) {
          setError('Invalid email or password');
        }
      } else {
        const success = await register(formData);
        if (!success) {
          setError('Registration failed. Please try again.');
        }
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 w-full max-w-md">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
            {mode === 'login' ? 'Login' : 'Create Account'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl"
          >
            ×
          </button>
        </div>

        {error && (
          <div className="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Full Name
                </label>
                <input
                  type="text"
                  name="full_name"
                  value={formData.full_name}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  placeholder="254700000000"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Account Type
                </label>
                <select
                  name="role"
                  value={formData.role}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                >
                  <option value="customer">Personal Account</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>
            </>
          )}
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Email
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Password
            </label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors font-semibold disabled:opacity-50"
          >
            {loading ? 'Loading...' : mode === 'login' ? 'Login' : 'Create Account'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-gray-600 dark:text-gray-400">
            {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
            <button
              onClick={() => onSwitchMode(mode === 'login' ? 'register' : 'login')}
              className="text-blue-600 dark:text-blue-400 hover:underline ml-1 font-semibold"
            >
              {mode === 'login' ? 'Sign Up' : 'Login'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

const Dashboard = () => {
  const { user, logout } = useAuth();
  const { toggleTheme, isDark } = useTheme();
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState({ balance: 0, account_number: '', recent_transactions: [] });
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [transferData, setTransferData] = useState({ to_account: '', amount: '', description: '' });
  const [mpesaData, setMpesaData] = useState({ phone: '', amount: '' });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [statsRes, transactionsRes] = await Promise.all([
        axios.get(`${API}/dashboard/stats`),
        axios.get(`${API}/transactions`)
      ]);
      
      setStats(statsRes.data);
      setTransactions(transactionsRes.data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTransfer = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/transactions/transfer`, {
        ...transferData,
        transaction_type: 'transfer',
        amount: parseFloat(transferData.amount)
      });
      
      setTransferData({ to_account: '', amount: '', description: '' });
      alert('Transfer successful!');
      fetchDashboardData();
    } catch (error) {
      alert('Transfer failed: ' + (error.response?.data?.detail || 'Unknown error'));
    }
  };

  const handleMpesaDeposit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/mpesa/deposit`, {
        ...mpesaData,
        account_number: stats.account_number,
        amount: parseFloat(mpesaData.amount)
      });
      
      setMpesaData({ phone: '', amount: '' });
      alert('STK Push sent to your phone!');
      setTimeout(fetchDashboardData, 5000); // Refresh after 5 seconds
    } catch (error) {
      alert('M-Pesa deposit failed: ' + (error.response?.data?.detail || 'Unknown error'));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center mr-3">
                <span className="text-white font-bold">KB</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-800 dark:text-white">KenyaBank</h1>
            </div>
            
            <div className="flex items-center space-x-4">
              <span className="text-gray-600 dark:text-gray-300">Welcome, {user.full_name}</span>
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                {isDark ? '🌞' : '🌙'}
              </button>
              <button
                onClick={logout}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Navigation Tabs */}
        <div className="flex space-x-1 mb-8 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
          {[
            { id: 'overview', name: 'Overview', icon: '📊' },
            { id: 'transfer', name: 'Transfer', icon: '💸' },
            { id: 'mpesa', name: 'M-Pesa', icon: '📱' },
            { id: 'transactions', name: 'Transactions', icon: '📋' },
            ...(user.role === 'admin' ? [{ id: 'admin', name: 'Admin', icon: '⚙️' }] : [])
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center space-x-2 py-3 px-4 rounded-md font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.name}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Account Summary */}
            <div className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-8 text-white">
                <h2 className="text-2xl font-bold mb-6">Account Overview</h2>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-blue-200 mb-2">Current Balance</p>
                    <p className="text-4xl font-bold">KES {stats.balance?.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-blue-200 mb-2">Account Number</p>
                    <p className="text-xl font-mono">{stats.account_number}</p>
                    <p className="text-blue-200 mt-4 mb-2">Account Holder</p>
                    <p className="text-lg">{user.full_name}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Quick Actions</h3>
                <div className="space-y-3">
                  <button 
                    onClick={() => setActiveTab('transfer')}
                    className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    💸 Transfer Money
                  </button>
                  <button 
                    onClick={() => setActiveTab('mpesa')}
                    className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 transition-colors"
                  >
                    📱 M-Pesa Deposit
                  </button>
                  <button 
                    onClick={() => setActiveTab('transactions')}
                    className="w-full bg-gray-600 text-white py-3 rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    📋 View Transactions
                  </button>
                </div>
              </div>
            </div>

            {/* Recent Transactions */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
              <h3 className="text-xl font-semibold text-gray-800 dark:text-white mb-6">Recent Transactions</h3>
              {stats.recent_transactions?.length > 0 ? (
                <div className="space-y-4">
                  {stats.recent_transactions.map((transaction) => (
                    <div key={transaction.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <div className="flex items-center space-x-4">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                          transaction.transaction_type === 'deposit' || transaction.transaction_type === 'mpesa_deposit' 
                            ? 'bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400' 
                            : 'bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400'
                        }`}>
                          {transaction.transaction_type === 'transfer' ? '💸' : 
                           transaction.transaction_type.includes('mpesa') ? '📱' : '💰'}
                        </div>
                        <div>
                          <p className="font-medium text-gray-800 dark:text-white capitalize">
                            {transaction.transaction_type.replace('_', ' ')}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{transaction.description}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-semibold ${
                          transaction.transaction_type === 'deposit' || transaction.transaction_type === 'mpesa_deposit' 
                            ? 'text-green-600 dark:text-green-400' 
                            : 'text-red-600 dark:text-red-400'
                        }`}>
                          {transaction.transaction_type === 'deposit' || transaction.transaction_type === 'mpesa_deposit' ? '+' : '-'}
                          KES {transaction.amount?.toLocaleString()}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{transaction.status}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400 text-center py-8">No recent transactions</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'transfer' && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-sm">
              <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">Transfer Money</h2>
              <form onSubmit={handleTransfer} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Recipient Account Number
                  </label>
                  <input
                    type="text"
                    value={transferData.to_account}
                    onChange={(e) => setTransferData({...transferData, to_account: e.target.value})}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    placeholder="KB1234567890"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Amount (KES)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={transferData.amount}
                    onChange={(e) => setTransferData({...transferData, amount: e.target.value})}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    placeholder="0.00"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Description
                  </label>
                  <input
                    type="text"
                    value={transferData.description}
                    onChange={(e) => setTransferData({...transferData, description: e.target.value})}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    placeholder="Payment description"
                    required
                  />
                </div>
                
                <button
                  type="submit"
                  className="w-full bg-blue-600 text-white py-4 rounded-lg hover:bg-blue-700 transition-colors font-semibold text-lg"
                >
                  Transfer Money
                </button>
              </form>
            </div>
          </div>
        )}

        {activeTab === 'mpesa' && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-sm">
              <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">M-Pesa Deposit</h2>
              <form onSubmit={handleMpesaDeposit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    M-Pesa Phone Number
                  </label>
                  <input
                    type="tel"
                    value={mpesaData.phone}
                    onChange={(e) => setMpesaData({...mpesaData, phone: e.target.value})}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-white"
                    placeholder="254700000000"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Amount (KES)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={mpesaData.amount}
                    onChange={(e) => setMpesaData({...mpesaData, amount: e.target.value})}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-white"
                    placeholder="0.00"
                    required
                  />
                </div>
                
                <div className="bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700 rounded-lg p-4">
                  <p className="text-green-800 dark:text-green-200 text-sm">
                    📱 You will receive an STK Push notification on your phone to complete the payment.
                  </p>
                </div>
                
                <button
                  type="submit"
                  className="w-full bg-green-600 text-white py-4 rounded-lg hover:bg-green-700 transition-colors font-semibold text-lg"
                >
                  Send STK Push
                </button>
              </form>
            </div>
          </div>
        )}

        {activeTab === 'transactions' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">Transaction History</h2>
            {transactions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Type</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Description</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Amount</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                    {transactions.map((transaction) => (
                      <tr key={transaction.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {new Date(transaction.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-800 dark:text-white capitalize">
                          {transaction.transaction_type.replace('_', ' ')}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                          {transaction.description}
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm font-semibold ${
                          transaction.transaction_type === 'deposit' || transaction.transaction_type === 'mpesa_deposit' 
                            ? 'text-green-600 dark:text-green-400' 
                            : 'text-red-600 dark:text-red-400'
                        }`}>
                          {transaction.transaction_type === 'deposit' || transaction.transaction_type === 'mpesa_deposit' ? '+' : '-'}
                          KES {transaction.amount?.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            transaction.status === 'completed' 
                              ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' 
                              : transaction.status === 'pending'
                              ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
                              : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                          }`}>
                            {transaction.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">No transactions found</p>
            )}
          </div>
        )}

        {activeTab === 'admin' && user.role === 'admin' && (
          <AdminPanel />
        )}
      </div>
    </div>
  );
};

const AdminPanel = () => {
  const [users, setUsers] = useState([]);
  const [allTransactions, setAllTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUser, setNewUser] = useState({
    email: '',
    full_name: '',
    phone: '',
    password: '',
    role: 'customer'
  });

  useEffect(() => {
    fetchAdminData();
  }, []);

  const fetchAdminData = async () => {
    try {
      const [usersRes, transactionsRes] = await Promise.all([
        axios.get(`${API}/admin/users`),
        axios.get(`${API}/admin/transactions`)
      ]);
      
      setUsers(usersRes.data);
      setAllTransactions(transactionsRes.data);
    } catch (error) {
      console.error('Error fetching admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/admin/users`, newUser);
      setNewUser({ email: '', full_name: '', phone: '', password: '', role: 'customer' });
      setShowCreateUser(false);
      fetchAdminData();
      alert('User created successfully!');
    } catch (error) {
      alert('Failed to create user: ' + (error.response?.data?.detail || 'Unknown error'));
    }
  };

  const toggleUserStatus = async (userId) => {
    try {
      await axios.patch(`${API}/admin/users/${userId}/status`);
      fetchAdminData();
    } catch (error) {
      alert('Failed to update user status');
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading admin data...</div>;
  }

  return (
    <div className="space-y-8">
      {/* Admin Stats */}
      <div className="grid lg:grid-cols-4 gap-6">
        <div className="bg-blue-50 dark:bg-blue-900 p-6 rounded-2xl">
          <h3 className="text-lg font-semibold text-blue-800 dark:text-blue-200 mb-2">Total Users</h3>
          <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{users.length}</p>
        </div>
        <div className="bg-green-50 dark:bg-green-900 p-6 rounded-2xl">
          <h3 className="text-lg font-semibold text-green-800 dark:text-green-200 mb-2">Active Users</h3>
          <p className="text-3xl font-bold text-green-600 dark:text-green-400">
            {users.filter(u => u.is_active).length}
          </p>
        </div>
        <div className="bg-purple-50 dark:bg-purple-900 p-6 rounded-2xl">
          <h3 className="text-lg font-semibold text-purple-800 dark:text-purple-200 mb-2">Total Transactions</h3>
          <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">{allTransactions.length}</p>
        </div>
        <div className="bg-orange-50 dark:bg-orange-900 p-6 rounded-2xl">
          <h3 className="text-lg font-semibold text-orange-800 dark:text-orange-200 mb-2">Total Volume</h3>
          <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">
            KES {allTransactions.reduce((sum, t) => sum + (t.amount || 0), 0).toLocaleString()}
          </p>
        </div>
      </div>

      {/* User Management */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-semibold text-gray-800 dark:text-white">User Management</h3>
          <button
            onClick={() => setShowCreateUser(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Create User
          </button>
        </div>

        {showCreateUser && (
          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <h4 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Create New User</h4>
            <form onSubmit={handleCreateUser} className="grid md:grid-cols-2 gap-4">
              <input
                type="email"
                placeholder="Email"
                value={newUser.email}
                onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white"
                required
              />
              <input
                type="text"
                placeholder="Full Name"
                value={newUser.full_name}
                onChange={(e) => setNewUser({...newUser, full_name: e.target.value})}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white"
                required
              />
              <input
                type="tel"
                placeholder="Phone"
                value={newUser.phone}
                onChange={(e) => setNewUser({...newUser, phone: e.target.value})}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white"
                required
              />
              <input
                type="password"
                placeholder="Password"
                value={newUser.password}
                onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white"
                required
              />
              <select
                value={newUser.role}
                onChange={(e) => setNewUser({...newUser, role: e.target.value})}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white"
              >
                <option value="customer">Customer</option>
                <option value="admin">Admin</option>
              </select>
              <div className="flex space-x-2">
                <button
                  type="submit"
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateUser(false)}
                  className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Account</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Balance</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="px-6 py-4 text-sm font-medium text-gray-800 dark:text-white">{user.full_name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">{user.email}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300 font-mono">{user.account_number}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">KES {user.balance?.toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      user.role === 'admin' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      user.is_active ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                    }`}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => toggleUserStatus(user.id)}
                      className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                        user.is_active ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-green-600 text-white hover:bg-green-700'
                      }`}
                    >
                      {user.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transaction Overview */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
        <h3 className="text-xl font-semibold text-gray-800 dark:text-white mb-6">Recent Transactions</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">From</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">To</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
              {allTransactions.slice(0, 10).map((transaction) => (
                <tr key={transaction.id}>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                    {new Date(transaction.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-800 dark:text-white capitalize">
                    {transaction.transaction_type?.replace('_', ' ')}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300 font-mono">
                    {transaction.from_account || '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300 font-mono">
                    {transaction.to_account || '-'}
                  </td>
                  <td className="px-6 py-4 text-sm font-semibold text-gray-800 dark:text-white">
                    KES {transaction.amount?.toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      transaction.status === 'completed' 
                        ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' 
                        : transaction.status === 'pending'
                        ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
                        : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                    }`}>
                      {transaction.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

function App() {
  const [showAuth, setShowAuth] = useState(null);
  
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent showAuth={showAuth} setShowAuth={setShowAuth} />
      </AuthProvider>
    </ThemeProvider>
  );
}

const AppContent = ({ showAuth, setShowAuth }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="App">
      {user ? (
        <Dashboard />
      ) : (
        <>
          <LandingPage onShowAuth={setShowAuth} />
          {showAuth && (
            <AuthModal
              mode={showAuth}
              onClose={() => setShowAuth(null)}
              onSwitchMode={(mode) => setShowAuth(mode)}
            />
          )}
        </>
      )}
    </div>
  );
};

export default App;