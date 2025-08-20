import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';

// Context imports (assuming they're available from parent)
const useAuth = () => {
  // This would typically be imported from a context
  // For now, we'll assume it's available globally
  return window.authContext || {};
};

const useTheme = () => {
  // This would typically be imported from a context
  return window.themeContext || { isDark: false, toggleTheme: () => {} };
};

const Dashboard = () => {
  const { user, logout } = useAuth();
  const { toggleTheme, isDark } = useTheme();
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState({ balance: 0, account_number: '', recent_transactions: [] });
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Form states
  const [transferData, setTransferData] = useState({ to_account: '', amount: '', description: '' });
  const [mpesaData, setMpesaData] = useState({ phone: '', amount: '' });
  const [transferLoading, setTransferLoading] = useState(false);
  const [mpesaLoading, setMpesaLoading] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [transactionFilter, setTransactionFilter] = useState({
    type: '',
    status: ''
  });

  // Fetch dashboard data with error handling and retries
  const fetchDashboardData = useCallback(async (retries = 3) => {
    try {
      setLoading(true);
      setError('');
      
      const [statsRes, transactionsRes] = await Promise.all([
        axios.get('/dashboard/stats'),
        axios.get('/transactions', {
          params: {
            page: currentPage,
            limit: 20,
            transaction_type: transactionFilter.type || undefined,
            status: transactionFilter.status || undefined
          }
        })
      ]);
      
      setStats(statsRes.data);
      setTransactions(transactionsRes.data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      
      if (retries > 0) {
        setTimeout(() => fetchDashboardData(retries - 1), 2000);
      } else {
        setError('Failed to load dashboard data. Please refresh the page.');
      }
    } finally {
      setLoading(false);
    }
  }, [currentPage, transactionFilter]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Handle money transfer with validation
  const handleTransfer = async (e) => {
    e.preventDefault();
    setTransferLoading(true);
    
    try {
      // Client-side validation
      if (!transferData.to_account || !transferData.amount || !transferData.description) {
        throw new Error('All fields are required');
      }
      
      if (parseFloat(transferData.amount) <= 0) {
        throw new Error('Amount must be greater than 0');
      }
      
      if (parseFloat(transferData.amount) > stats.balance) {
        throw new Error('Insufficient funds');
      }

      await axios.post('/transactions/transfer', {
        ...transferData,
        transaction_type: 'transfer',
        amount: parseFloat(transferData.amount)
      });
      
      setTransferData({ to_account: '', amount: '', description: '' });
      
      // Show success message
      showNotification('Transfer successful!', 'success');
      
      // Refresh data
      fetchDashboardData();
    } catch (error) {
      const message = error.response?.data?.detail || error.message || 'Transfer failed';
      showNotification(message, 'error');
    } finally {
      setTransferLoading(false);
    }
  };

  // Handle M-Pesa deposit
  const handleMpesaDeposit = async (e) => {
    e.preventDefault();
    setMpesaLoading(true);
    
    try {
      if (!mpesaData.phone || !mpesaData.amount) {
        throw new Error('Phone number and amount are required');
      }
      
      if (!/^254\d{9}$/.test(mpesaData.phone)) {
        throw new Error('Please enter a valid Kenyan phone number (254XXXXXXXXX)');
      }
      
      if (parseFloat(mpesaData.amount) <= 0 || parseFloat(mpesaData.amount) > 50000) {
        throw new Error('Amount must be between 1 and 50,000 KES');
      }

      await axios.post('/mpesa/deposit', {
        ...mpesaData,
        account_number: stats.account_number,
        amount: parseFloat(mpesaData.amount)
      });
      
      setMpesaData({ phone: '', amount: '' });
      showNotification('STK Push sent to your phone!', 'success');
      
      // Refresh data after delay to allow M-Pesa processing
      setTimeout(fetchDashboardData, 5000);
    } catch (error) {
      const message = error.response?.data?.detail || error.message || 'M-Pesa deposit failed';
      showNotification(message, 'error');
    } finally {
      setMpesaLoading(false);
    }
  };

  // Enhanced notification system
  const showNotification = (message, type) => {
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg transform transition-all duration-300 ${
      type === 'success' 
        ? 'bg-green-500 text-white' 
        : 'bg-red-500 text-white'
    }`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => notification.classList.add('translate-x-0'), 100);
    
    // Remove after 5 seconds
    setTimeout(() => {
      notification.classList.add('translate-x-full', 'opacity-0');
      setTimeout(() => document.body.removeChild(notification), 300);
    }, 5000);
  };

  // Format currency
  const formatCurrency = useCallback((amount) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(amount);
  }, []);

  // Format date
  const formatDate = useCallback((dateString) => {
    return new Intl.DateTimeFormat('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(dateString));
  }, []);

  // Memoized transaction list
  const transactionsList = useMemo(() => {
    if (!transactions.transactions) return [];
    
    return transactions.transactions.map((transaction) => ({
      ...transaction,
      formattedAmount: formatCurrency(transaction.amount),
      formattedDate: formatDate(transaction.created_at),
      isCredit: transaction.transaction_type === 'deposit' || 
                transaction.transaction_type === 'mpesa_deposit' ||
                (transaction.transaction_type === 'transfer' && transaction.to_account === stats.account_number)
    }));
  }, [transactions, formatCurrency, formatDate, stats.account_number]);

  if (loading && !stats.balance) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Enhanced Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center mr-3 shadow-lg">
                <span className="text-white font-bold">KB</span>
              </div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                KenyaBank
              </h1>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="hidden sm:block">
                <span className="text-gray-600 dark:text-gray-300">Welcome back, </span>
                <span className="font-semibold text-gray-800 dark:text-white">{user?.full_name}</span>
              </div>
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                aria-label="Toggle theme"
              >
                {isDark ? '🌞' : '🌙'}
              </button>
              <button
                onClick={logout}
                className="px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:from-red-600 hover:to-red-700 transition-all duration-200 font-semibold shadow-md hover:shadow-lg transform hover:scale-105"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
          <div className="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-lg p-4">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-red-600 dark:text-red-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="text-red-700 dark:text-red-200">{error}</span>
              <button
                onClick={() => setError('')}
                className="ml-auto text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Enhanced Navigation Tabs */}
        <div className="flex flex-wrap space-x-1 mb-8 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl shadow-inner">
          {[
            { id: 'overview', name: 'Overview', icon: '📊' },
            { id: 'transfer', name: 'Transfer', icon: '💸' },
            { id: 'mpesa', name: 'M-Pesa', icon: '📱' },
            { id: 'transactions', name: 'Transactions', icon: '📋' },
            ...(user?.role === 'admin' ? [{ id: 'admin', name: 'Admin', icon: '⚙️' }] : [])
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center space-x-2 py-3 px-4 rounded-lg font-medium transition-all duration-200 ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-md transform scale-105'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 hover:bg-white/50 dark:hover:bg-gray-700/50'
              }`}
            >
              <span className="text-lg">{tab.icon}</span>
              <span className="hidden sm:inline">{tab.name}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-8 animate-fade-in">
            {/* Account Summary */}
            <div className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-3xl p-8 text-white shadow-xl">
                <h2 className="text-3xl font-bold mb-6">Account Overview</h2>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-blue-200 mb-2 text-lg">Current Balance</p>
                    <p className="text-5xl font-bold mb-4">{formatCurrency(stats.balance)}</p>
                    <div className="flex items-center space-x-4">
                      <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                      <span className="text-blue-100">Account Active</span>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="text-blue-200 mb-2">Account Number</p>
                      <p className="text-xl font-mono font-semibold">{stats.account_number}</p>
                    </div>
                    <div>
                      <p className="text-blue-200 mb-2">Account Holder</p>
                      <p className="text-lg font-semibold">{user?.full_name}</p>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Quick Actions */}
              <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-xl">
                <h3 className="text-xl font-semibold text-gray-800 dark:text-white mb-6">Quick Actions</h3>
                <div className="space-y-4">
                  <button 
                    onClick={() => setActiveTab('transfer')}
                    className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white py-4 rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all duration-200 font-semibold shadow-md hover:shadow-lg transform hover:scale-105 flex items-center justify-center space-x-2"
                  >
                    <span>💸</span>
                    <span>Transfer Money</span>
                  </button>
                  <button 
                    onClick={() => setActiveTab('mpesa')}
                    className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white py-4 rounded-xl hover:from-green-600 hover:to-green-700 transition-all duration-200 font-semibold shadow-md hover:shadow-lg transform hover:scale-105 flex items-center justify-center space-x-2"
                  >
                    <span>📱</span>
                    <span>M-Pesa Deposit</span>
                  </button>
                  <button 
                    onClick={() => setActiveTab('transactions')}
                    className="w-full bg-gradient-to-r from-gray-500 to-gray-600 text-white py-4 rounded-xl hover:from-gray-600 hover:to-gray-700 transition-all duration-200 font-semibold shadow-md hover:shadow-lg transform hover:scale-105 flex items-center justify-center space-x-2"
                  >
                    <span>📋</span>
                    <span>View Transactions</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Recent Transactions */}
            <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-semibold text-gray-800 dark:text-white">Recent Activity</h3>
                <button
                  onClick={() => setActiveTab('transactions')}
                  className="text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                >
                  View All
                </button>
              </div>
              {stats.recent_transactions?.length > 0 ? (
                <div className="space-y-4">
                  {stats.recent_transactions.slice(0, 5).map((transaction) => (
                    <div key={transaction.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                      <div className="flex items-center space-x-4">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl ${
                          transaction.transaction_type === 'deposit' || transaction.transaction_type === 'mpesa_deposit' 
                            ? 'bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400' 
                            : 'bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400'
                        }`}>
                          {transaction.transaction_type === 'transfer' ? '💸' : 
                           transaction.transaction_type.includes('mpesa') ? '📱' : '💰'}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800 dark:text-white capitalize">
                            {transaction.transaction_type.replace('_', ' ')}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{transaction.description}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-500">{formatDate(transaction.created_at)}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-lg font-bold ${
                          transaction.transaction_type === 'deposit' || transaction.transaction_type === 'mpesa_deposit' 
                            ? 'text-green-600 dark:text-green-400' 
                            : 'text-red-600 dark:text-red-400'
                        }`}>
                          {transaction.transaction_type === 'deposit' || transaction.transaction_type === 'mpesa_deposit' ? '+' : '-'}
                          {formatCurrency(transaction.amount)}
                        </p>
                        <span className={`inline-block px-2 py-1 text-xs font-semibold rounded-full ${
                          transaction.status === 'completed' 
                            ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' 
                            : transaction.status === 'pending'
                            ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
                            : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                        }`}>
                          {transaction.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-2xl">📊</span>
                  </div>
                  <p className="text-gray-500 dark:text-gray-400">No recent transactions</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'transfer' && (
          <div className="max-w-2xl mx-auto animate-fade-in">
            <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 shadow-xl">
              <h2 className="text-3xl font-bold text-gray-800 dark:text-white mb-8 flex items-center">
                <span className="mr-3">💸</span>
                Transfer Money
              </h2>
              <form onSubmit={handleTransfer} className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Recipient Account Number
                  </label>
                  <input
                    type="text"
                    value={transferData.to_account}
                    onChange={(e) => setTransferData({...transferData, to_account: e.target.value})}
                    className="w-full px-4 py-4 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white transition-all duration-200"
                    placeholder="KB1234567890"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Amount (KES)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    max={stats.balance}
                    value={transferData.amount}
                    onChange={(e) => setTransferData({...transferData, amount: e.target.value})}
                    className="w-full px-4 py-4 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white transition-all duration-200"
                    placeholder="0.00"
                    required
                  />
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Available balance: {formatCurrency(stats.balance)}
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Description
                  </label>
                  <input
                    type="text"
                    value={transferData.description}
                    onChange={(e) => setTransferData({...transferData, description: e.target.value})}
                    className="w-full px-4 py-4 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white transition-all duration-200"
                    placeholder="Payment description"
                    required
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={transferLoading}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-4 rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 font-semibold text-lg disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:scale-105"
                >
                  {transferLoading ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                      Processing Transfer...
                    </div>
                  ) : (
                    'Transfer Money'
                  )}
                </button>
              </form>
            </div>
          </div>
        )}

        {activeTab === 'mpesa' && (
          <div className="max-w-2xl mx-auto animate-fade-in">
            <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 shadow-xl">
              <h2 className="text-3xl font-bold text-gray-800 dark:text-white mb-8 flex items-center">
                <span className="mr-3">📱</span>
                M-Pesa Deposit
              </h2>
              <form onSubmit={handleMpesaDeposit} className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    M-Pesa Phone Number
                  </label>
                  <input
                    type="tel"
                    value={mpesaData.phone}
                    onChange={(e) => setMpesaData({...mpesaData, phone: e.target.value})}
                    className="w-full px-4 py-4 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-white transition-all duration-200"
                    placeholder="254700000000"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Amount (KES)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    max="50000"
                    value={mpesaData.amount}
                    onChange={(e) => setMpesaData({...mpesaData, amount: e.target.value})}
                    className="w-full px-4 py-4 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-white transition-all duration-200"
                    placeholder="0.00"
                    required
                  />
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Minimum: KES 1, Maximum: KES 50,000
                  </p>
                </div>
                
                <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-xl p-4">
                  <div className="flex items-start space-x-3">
                    <span className="text-green-600 dark:text-green-400 text-xl">📱</span>
                    <div>
                      <p className="text-green-800 dark:text-green-200 font-semibold mb-1">How it works:</p>
                      <ol className="text-green-700 dark:text-green-300 text-sm space-y-1">
                        <li>1. Enter your M-Pesa number and amount</li>
                        <li>2. You'll receive an STK Push on your phone</li>
                        <li>3. Enter your M-Pesa PIN to complete</li>
                        <li>4. Money will be added to your account instantly</li>
                      </ol>
                    </div>
                  </div>
                </div>
                
                <button
                  type="submit"
                  disabled={mpesaLoading}
                  className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white py-4 rounded-xl hover:from-green-700 hover:to-emerald-700 transition-all duration-200 font-semibold text-lg disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:scale-105"
                >
                  {mpesaLoading ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                      Sending STK Push...
                    </div>
                  ) : (
                    'Send STK Push'
                  )}
                </button>
              </form>
            </div>
          </div>
        )}

        {activeTab === 'transactions' && (
          <div className="space-y-6 animate-fade-in">
            {/* Transaction Filters */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Filter Transactions</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Transaction Type
                  </label>
                  <select
                    value={transactionFilter.type}
                    onChange={(e) => setTransactionFilter({...transactionFilter, type: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                  >
                    <option value="">All Types</option>
                    <option value="transfer">Transfer</option>
                    <option value="mpesa_deposit">M-Pesa Deposit</option>
                    <option value="deposit">Deposit</option>
                    <option value="withdrawal">Withdrawal</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Status
                  </label>
                  <select
                    value={transactionFilter.status}
                    onChange={(e) => setTransactionFilter({...transactionFilter, status: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                  >
                    <option value="">All Status</option>
                    <option value="completed">Completed</option>
                    <option value="pending">Pending</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Transaction History */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
              <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-2xl font-semibold text-gray-800 dark:text-white flex items-center">
                  <span className="mr-3">📋</span>
                  Transaction History
                </h2>
              </div>
              
              {transactionsList.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date & Time</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Type</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Description</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Amount</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-600">
                      {transactionsList.map((transaction) => (
                        <tr key={transaction.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                            {transaction.formattedDate}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <span className="text-lg mr-2">
                                {transaction.transaction_type === 'transfer' ? '💸' : 
                                 transaction.transaction_type.includes('mpesa') ? '📱' : '💰'}
                              </span>
                              <span className="text-sm font-medium text-gray-800 dark:text-white capitalize">
                                {transaction.transaction_type.replace('_', ' ')}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                            {transaction.description}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`text-sm font-bold ${
                              transaction.isCredit 
                                ? 'text-green-600 dark:text-green-400' 
                                : 'text-red-600 dark:text-red-400'
                            }`}>
                              {transaction.isCredit ? '+' : '-'}{transaction.formattedAmount}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
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
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-2xl">📋</span>
                  </div>
                  <p className="text-gray-500 dark:text-gray-400">No transactions found</p>
                </div>
              )}

              {/* Pagination */}
              {transactions.total_pages > 1 && (
                <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Showing page {transactions.page} of {transactions.total_pages}
                  </p>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={!transactions.has_prev}
                      className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setCurrentPage(currentPage + 1)}
                      disabled={!transactions.has_next}
                      className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'admin' && user?.role === 'admin' && (
          <div className="animate-fade-in">
            {/* Admin panel will be imported as a separate component */}
            <div className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-300">Admin panel loading...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;