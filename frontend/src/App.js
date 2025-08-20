import React, { useState, useEffect, createContext, useContext, Suspense, lazy, useCallback, useMemo, useRef } from 'react';
import './App.css';
import axios from 'axios';

// Configure axios defaults
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

axios.defaults.baseURL = API;
axios.defaults.timeout = 30000;

// Add axios interceptors for better error handling and retry logic
axios.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config;
    
    // Retry logic for network errors
    if (error.code === 'NETWORK_ERROR' && !originalRequest._retry) {
      originalRequest._retry = true;
      await new Promise(resolve => setTimeout(resolve, 1000));
      return axios(originalRequest);
    }
    
    // Handle 401 errors (token expiration)
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      localStorage.removeItem('token');
      window.location.reload();
    }
    
    return Promise.reject(error);
  }
);

// Lazy load components for better performance
const Dashboard = lazy(() => import('./components/Dashboard'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const TransactionHistory = lazy(() => import('./components/TransactionHistory'));

// Auth Context with enhanced features
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
  const [mfaRequired, setMfaRequired] = useState(false);
  const retryTimeoutRef = useRef();

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUser();
    } else {
      setLoading(false);
    }
    
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [token]);

  const fetchUser = useCallback(async () => {
    try {
      const response = await axios.get('/auth/me');
      setUser(response.data);
      setMfaRequired(false);
    } catch (error) {
      console.error('Error fetching user:', error);
      if (error.response?.status === 401) {
        logout();
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email, password, mfaCode = null) => {
    try {
      const response = await axios.post('/auth/login', { 
        email, 
        password, 
        mfa_code: mfaCode 
      });
      
      const { access_token, mfa_required } = response.data;
      
      if (mfa_required) {
        setMfaRequired(true);
        return { success: true, mfaRequired: true };
      }
      
      localStorage.setItem('token', access_token);
      setToken(access_token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      setMfaRequired(false);
      
      return { success: true, mfaRequired: false };
    } catch (error) {
      console.error('Login error:', error);
      return { 
        success: false, 
        error: error.response?.data?.detail || 'Login failed' 
      };
    }
  }, []);

  const register = useCallback(async (userData) => {
    try {
      await axios.post('/auth/register', userData);
      return await login(userData.email, userData.password);
    } catch (error) {
      console.error('Registration error:', error);
      return { 
        success: false, 
        error: error.response?.data?.detail || 'Registration failed' 
      };
    }
  }, [login]);

  const logout = useCallback(async () => {
    try {
      await axios.post('/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('token');
      setToken(null);
      setUser(null);
      setMfaRequired(false);
      delete axios.defaults.headers.common['Authorization'];
    }
  }, []);

  const value = useMemo(() => ({
    user,
    login,
    register,
    logout,
    loading,
    mfaRequired,
    setMfaRequired
  }), [user, login, register, logout, loading, mfaRequired]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// Theme Context with persistence
const ThemeContext = createContext();

const ThemeProvider = ({ children }) => {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved ? saved === 'dark' : false;
  });

  const toggleTheme = useCallback(() => {
    const newTheme = !isDark;
    setIsDark(newTheme);
    localStorage.setItem('theme', newTheme ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', newTheme);
  }, [isDark]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  const value = useMemo(() => ({
    isDark,
    toggleTheme
  }), [isDark, toggleTheme]);

  return (
    <ThemeContext.Provider value={value}>
      <div className={isDark ? 'dark' : ''}>{children}</div>
    </ThemeContext.Provider>
  );
};

const useTheme = () => useContext(ThemeContext);

// Performance monitoring hook
const usePerformance = () => {
  useEffect(() => {
    if (typeof window !== 'undefined' && window.performance) {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry) => {
          if (entry.entryType === 'navigation') {
            console.log('Page load time:', entry.loadEventEnd - entry.fetchStart);
          }
        });
      });
      observer.observe({ entryTypes: ['navigation'] });
      
      return () => observer.disconnect();
    }
  }, []);
};

// Error Boundary Component
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
    
    // Log error to monitoring service
    console.error('Application error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 max-w-md w-full">
            <div className="text-center">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-red-600 dark:text-red-400 text-2xl">⚠️</span>
              </div>
              <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">
                Something went wrong
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mb-6">
                We're sorry, but something unexpected happened. Please refresh the page or contact support if the problem persists.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Refresh Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Loading Spinner Component
const LoadingSpinner = ({ size = 'medium', text = 'Loading...' }) => {
  const sizeClasses = {
    small: 'w-4 h-4',
    medium: 'w-8 h-8',
    large: 'w-16 h-16'
  };

  return (
    <div className="flex flex-col items-center justify-center p-8">
      <div className={`animate-spin rounded-full border-b-2 border-blue-600 ${sizeClasses[size]}`}></div>
      {text && <p className="mt-2 text-gray-600 dark:text-gray-300">{text}</p>}
    </div>
  );
};

// Optimized Image Component with lazy loading
const OptimizedImage = ({ src, alt, className, ...props }) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const imgRef = useRef();

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const image = new Image();
            image.onload = () => setLoaded(true);
            image.onerror = () => setError(true);
            image.src = src;
            observer.unobserve(img);
          }
        });
      },
      { threshold: 0.1 }
    );

    observer.observe(img);
    return () => observer.disconnect();
  }, [src]);

  if (error) {
    return (
      <div className={`bg-gray-200 dark:bg-gray-700 flex items-center justify-center ${className}`} {...props}>
        <span className="text-gray-400 text-sm">Failed to load image</span>
      </div>
    );
  }

  return (
    <div ref={imgRef} className={className} {...props}>
      {loaded ? (
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-cover transition-opacity duration-300"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full bg-gray-200 dark:bg-gray-700 animate-pulse flex items-center justify-center">
          <span className="text-gray-400 text-sm">Loading...</span>
        </div>
      )}
    </div>
  );
};

// Enhanced Landing Page Component
const LandingPage = ({ onShowAuth }) => {
  const { toggleTheme, isDark } = useTheme();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const services = [
    {
      title: "M-Pesa Integration",
      description: "Seamlessly deposit and withdraw money using M-Pesa. Send money to any M-Pesa number directly from your bank account.",
      icon: "📱",
      color: "from-green-50 to-emerald-100 dark:from-gray-700 dark:to-gray-600",
      image: "https://images.unsplash.com/photo-1537724326059-2ea20251b9c8?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1ODB8MHwxfHNlYXJjaHwyfHxiYW5raW5nfGVufDB8fHx8MTc1MzAxNjYyM3ww&ixlib=rb-4.1.0&q=85",
      features: ["Instant deposits", "Fast withdrawals", "Low transaction fees"]
    },
    {
      title: "Online Banking",
      description: "Manage your accounts, transfer money, and track expenses from anywhere, anytime with our secure online platform.",
      icon: "💻",
      color: "from-blue-50 to-indigo-100 dark:from-gray-700 dark:to-gray-600",
      image: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDJ8MHwxfHNlYXJjaHwzfHxmaW5hbmNpYWx8ZW58MHx8fHwxNzUzMDE2NjMxfDA&ixlib=rb-4.1.0&q=85",
      features: ["24/7 account access", "Real-time notifications", "Secure transactions"]
    },
    {
      title: "ATM Network",
      description: "Access your money at over 1,000 ATMs across Kenya. Withdraw cash, check balances, and more.",
      icon: "🏧",
      color: "from-purple-50 to-pink-100 dark:from-gray-700 dark:to-gray-600",
      image: "https://images.unsplash.com/photo-1601597111158-2fceff292cdc?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1ODB8MHwxfHNlYXJjaHwzfHxiYW5raW5nfGVufDB8fHx8MTc1MzAxNjYyM3ww&ixlib=rb-4.1.0&q=85",
      features: ["Nationwide network", "Free withdrawals", "Mini statements"]
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 transition-colors">
      {/* Navigation */}
      <nav className="flex flex-col sm:flex-row justify-between items-center p-6 max-w-7xl mx-auto">
        <div className="flex items-center space-x-2 mb-4 sm:mb-0">
          <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
            <span className="text-white font-bold text-lg">KB</span>
          </div>
          <span className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            KenyaBank
          </span>
        </div>
        
        <div className="flex items-center space-x-4">
          <button
            onClick={toggleTheme}
            className="p-3 rounded-xl bg-white/50 dark:bg-gray-800/50 hover:bg-white/70 dark:hover:bg-gray-700/70 transition-all duration-300 backdrop-blur-sm shadow-lg"
            aria-label="Toggle theme"
          >
            {isDark ? '🌞' : '🌙'}
          </button>
          <button
            onClick={() => onShowAuth('login')}
            className="px-6 py-3 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-gray-700 rounded-xl transition-all duration-300 font-semibold"
          >
            Login
          </button>
          <button
            onClick={() => onShowAuth('register')}
            className="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-300 font-semibold shadow-lg hover:shadow-xl transform hover:scale-105"
          >
            Get Started
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className={`max-w-7xl mx-auto px-6 py-20 transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-8">
            <h1 className="text-5xl lg:text-7xl font-bold text-gray-800 dark:text-white leading-tight">
              Banking Made
              <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent block">
                Simple & Secure
              </span>
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-300 leading-relaxed max-w-2xl">
              Experience the future of banking with KenyaBank. Send money via M-Pesa, manage your accounts, and bank securely from anywhere in Kenya with enterprise-grade security.
            </p>
            <div className="flex flex-col sm:flex-row gap-6">
              <button
                onClick={() => onShowAuth('register')}
                className="group px-10 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-300 font-semibold text-lg shadow-xl hover:shadow-2xl transform hover:scale-105"
              >
                <span className="flex items-center justify-center">
                  Open Account Now
                  <svg className="w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </span>
              </button>
              <button className="px-10 py-4 border-2 border-blue-600 text-blue-600 dark:text-blue-400 rounded-2xl hover:bg-blue-50 dark:hover:bg-gray-700 transition-all duration-300 font-semibold text-lg backdrop-blur-sm">
                Learn More
              </button>
            </div>
            
            {/* Trust indicators */}
            <div className="flex flex-wrap items-center gap-6 pt-8">
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <span className="text-gray-600 dark:text-gray-300">Central Bank Licensed</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <span className="text-gray-600 dark:text-gray-300">256-bit Encryption</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-xs font-bold">24</span>
                </div>
                <span className="text-gray-600 dark:text-gray-300">24/7 Support</span>
              </div>
            </div>
          </div>
          
          <div className="relative">
            <OptimizedImage 
              src="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDJ8MHwxfHNlYXJjaHwxfHxmaW5hbmNpYWx8ZW58MHx8fHwxNzUzMDE2NjMxfDA&ixlib=rb-4.1.0&q=85"
              alt="Financial district showing modern banking"
              className="rounded-3xl shadow-2xl w-full h-96 overflow-hidden transform hover:scale-105 transition-transform duration-700"
            />
            <div className="absolute -bottom-6 -left-6 bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-2xl backdrop-blur-sm">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-gradient-to-r from-green-400 to-green-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-xl">✓</span>
                </div>
                <div>
                  <p className="font-semibold text-gray-800 dark:text-white">Secure Banking</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Enterprise Security</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section className="bg-white/50 dark:bg-gray-800/50 py-20 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl lg:text-5xl font-bold text-gray-800 dark:text-white mb-6">
              Our Banking Services
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
              Everything you need for modern banking in Kenya with cutting-edge technology and unmatched security
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {services.map((service, index) => (
              <div
                key={index}
                className={`group bg-gradient-to-br ${service.color} p-8 rounded-3xl hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-2 cursor-pointer border border-white/20`}
              >
                <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-2xl flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 transition-transform duration-300">
                  <span className="text-2xl">{service.icon}</span>
                </div>
                <h3 className="text-2xl font-bold text-gray-800 dark:text-white mb-4 group-hover:text-blue-600 transition-colors">
                  {service.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
                  {service.description}
                </p>
                <ul className="space-y-3">
                  {service.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-center text-gray-600 dark:text-gray-300">
                      <span className="w-5 h-5 bg-gradient-to-r from-green-400 to-green-500 rounded-full flex items-center justify-center mr-3 flex-shrink-0">
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gradient-to-r from-blue-600 to-indigo-600 py-20">
        <div className="max-w-4xl mx-auto text-center px-6">
          <h2 className="text-4xl lg:text-5xl font-bold text-white mb-6">
            Ready to Start Banking with Us?
          </h2>
          <p className="text-xl text-blue-100 mb-8 leading-relaxed">
            Join thousands of Kenyans who trust KenyaBank for their financial needs. Open your account in minutes with enterprise-grade security.
          </p>
          <button
            onClick={() => onShowAuth('register')}
            className="group px-10 py-4 bg-white text-blue-600 rounded-2xl hover:bg-gray-50 transition-all duration-300 font-semibold text-lg transform hover:scale-105 shadow-xl"
          >
            <span className="flex items-center justify-center">
              Open Your Account Today
              <svg className="w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </span>
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold">KB</span>
                </div>
                <span className="text-xl font-bold">KenyaBank</span>
              </div>
              <p className="text-gray-400 leading-relaxed">
                Your trusted banking partner in Kenya. Secure, reliable, and always here for you with enterprise-grade security.
              </p>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4 text-lg">Services</h4>
              <ul className="space-y-2 text-gray-400">
                <li className="hover:text-white transition-colors cursor-pointer">Personal Banking</li>
                <li className="hover:text-white transition-colors cursor-pointer">Business Banking</li>
                <li className="hover:text-white transition-colors cursor-pointer">M-Pesa Integration</li>
                <li className="hover:text-white transition-colors cursor-pointer">Online Banking</li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4 text-lg">Support</h4>
              <ul className="space-y-2 text-gray-400">
                <li className="hover:text-white transition-colors cursor-pointer">Help Center</li>
                <li className="hover:text-white transition-colors cursor-pointer">Contact Us</li>
                <li className="hover:text-white transition-colors cursor-pointer">Security Center</li>
                <li className="hover:text-white transition-colors cursor-pointer">Terms & Conditions</li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4 text-lg">Contact</h4>
              <ul className="space-y-2 text-gray-400">
                <li className="flex items-center">
                  <span className="mr-2">📞</span>
                  +254 700 000 000
                </li>
                <li className="flex items-center">
                  <span className="mr-2">📧</span>
                  hello@kenyabank.co.ke
                </li>
                <li className="flex items-center">
                  <span className="mr-2">📍</span>
                  Nairobi, Kenya
                </li>
                <li className="flex items-center">
                  <span className="mr-2">🕒</span>
                  24/7 Support
                </li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-700 pt-8 flex flex-col md:flex-row justify-between items-center">
            <p className="text-gray-400 mb-4 md:mb-0">
              &copy; 2024 KenyaBank. All rights reserved. Licensed by Central Bank of Kenya.
            </p>
            <div className="flex space-x-6">
              <span className="text-gray-400 hover:text-white transition-colors cursor-pointer">Privacy Policy</span>
              <span className="text-gray-400 hover:text-white transition-colors cursor-pointer">Terms of Service</span>
              <span className="text-gray-400 hover:text-white transition-colors cursor-pointer">Security</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

// Enhanced Auth Modal with MFA support
const AuthModal = ({ mode, onClose, onSwitchMode }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    phone: '',
    role: 'customer',
    mfa_code: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login, register, mfaRequired, setMfaRequired } = useAuth();
  const { isDark } = useTheme();

  const validateForm = () => {
    if (!formData.email || !formData.password) {
      setError('Email and password are required');
      return false;
    }
    
    if (mode === 'register') {
      if (!formData.full_name || !formData.phone) {
        setError('All fields are required for registration');
        return false;
      }
      
      if (!/^254\d{9}$/.test(formData.phone)) {
        setError('Phone number must be in format 254XXXXXXXXX');
        return false;
      }
      
      if (formData.password.length < 8) {
        setError('Password must be at least 8 characters long');
        return false;
      }
    }
    
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setLoading(true);
    setError('');

    try {
      let result;
      if (mode === 'login') {
        result = await login(formData.email, formData.password, formData.mfa_code);
        
        if (result.mfaRequired) {
          setError('Please enter your MFA code');
          return;
        }
      } else {
        result = await register(formData);
      }
      
      if (!result.success) {
        setError(result.error);
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError(''); // Clear error when user types
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 w-full max-w-md shadow-2xl transform transition-all duration-300 scale-100">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-bold text-gray-800 dark:text-white">
            {mode === 'login' ? 'Welcome Back' : 'Create Account'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-3xl transition-colors"
            aria-label="Close modal"
          >
            ×
          </button>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-200 px-4 py-3 rounded-xl mb-4 animate-pulse">
            <div className="flex items-center">
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          </div>
        )}

        {mfaRequired && (
          <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-200 px-4 py-3 rounded-xl mb-4">
            <div className="flex items-center">
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 012 2 1 1 0 102 0 4 4 0 00-4-4z" clipRule="evenodd" />
              </svg>
              Multi-factor authentication required
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {mode === 'register' && (
            <>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Full Name
                </label>
                <input
                  type="text"
                  name="full_name"
                  value={formData.full_name}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white transition-all duration-200"
                  placeholder="Enter your full name"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  placeholder="254700000000"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white transition-all duration-200"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Account Type
                </label>
                <select
                  name="role"
                  value={formData.role}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white transition-all duration-200"
                >
                  <option value="customer">Personal Account</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>
            </>
          )}
          
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Email Address
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white transition-all duration-200"
              placeholder="Enter your email"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Password
            </label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white transition-all duration-200"
              placeholder="Enter your password"
              required
            />
          </div>

          {mfaRequired && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                MFA Code
              </label>
              <input
                type="text"
                name="mfa_code"
                value={formData.mfa_code}
                onChange={handleInputChange}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white transition-all duration-200"
                placeholder="Enter 6-digit code"
                maxLength="6"
                required
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-4 rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-300 font-semibold text-lg disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:scale-105"
          >
            {loading ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Processing...
              </div>
            ) : (
              mfaRequired ? 'Verify MFA Code' : (mode === 'login' ? 'Sign In' : 'Create Account')
            )}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-gray-600 dark:text-gray-400">
            {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
            <button
              onClick={() => {
                onSwitchMode(mode === 'login' ? 'register' : 'login');
                setMfaRequired(false);
                setError('');
                setFormData({
                  email: '',
                  password: '',
                  full_name: '',
                  phone: '',
                  role: 'customer',
                  mfa_code: ''
                });
              }}
              className="text-blue-600 dark:text-blue-400 hover:underline ml-1 font-semibold transition-colors"
            >
              {mode === 'login' ? 'Sign Up' : 'Sign In'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

// Main App Component
function App() {
  const [showAuth, setShowAuth] = useState(null);
  
  // Initialize performance monitoring
  usePerformance();

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <AppContent showAuth={showAuth} setShowAuth={setShowAuth} />
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

const AppContent = ({ showAuth, setShowAuth }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <LoadingSpinner size="large" text="Loading KenyaBank..." />
      </div>
    );
  }

  return (
    <div className="App">
      {user ? (
        <Suspense fallback={<LoadingSpinner size="large" text="Loading Dashboard..." />}>
          <Dashboard />
        </Suspense>
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