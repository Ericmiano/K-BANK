import React, { useState, useEffect } from 'react';
import axios from 'axios';

const AdminPanel = () => {
  const [users, setUsers] = useState([]);
  const [allTransactions, setAllTransactions] = useState([]);
  const [dashboardStats, setDashboardStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUser, setNewUser] = useState({
    email: '',
    full_name: '',
    phone: '',
    password: '',
    role: 'customer'
  });
  const [filters, setFilters] = useState({
    userRole: '',
    userActive: '',
    transactionStatus: '',
    transactionType: ''
  });

  useEffect(() => {
    fetchAdminData();
  }, []);

  const fetchAdminData = async () => {
    try {
      setLoading(true);
      const [usersRes, transactionsRes, dashboardRes] = await Promise.all([
        axios.get('/admin/users'),
        axios.get('/admin/transactions'),
        axios.get('/admin/dashboard')
      ]);
      
      setUsers(usersRes.data);
      setAllTransactions(transactionsRes.data);
      setDashboardStats(dashboardRes.data);
    } catch (error) {
      console.error('Error fetching admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/admin/users', newUser);
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
      await axios.patch(`/admin/users/${userId}/status`);
      fetchAdminData();
    } catch (error) {
      alert('Failed to update user status');
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading admin data...</div>;
  }

  // Filter users and transactions based on current filters
  const filteredUsers = users.filter(user => {
    if (filters.userRole && user.role !== filters.userRole) return false;
    if (filters.userActive !== '' && user.is_active !== (filters.userActive === 'true')) return false;
    return true;
  });

  const filteredTransactions = allTransactions.transactions ? 
    allTransactions.transactions.filter(transaction => {
      if (filters.transactionStatus && transaction.status !== filters.transactionStatus) return false;
      if (filters.transactionType && transaction.transaction_type !== filters.transactionType) return false;
      return true;
    }) : [];

  return (
    <div className="space-y-8">
      {/* Admin Dashboard Stats */}
      <div className="grid lg:grid-cols-4 gap-6">
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-6 rounded-2xl text-white shadow-xl">
          <h3 className="text-lg font-semibold mb-2">Total Users</h3>
          <p className="text-4xl font-bold">{dashboardStats.users?.total || users.length}</p>
          <p className="text-blue-100 text-sm mt-2">
            {dashboardStats.users?.active || users.filter(u => u.is_active).length} active
          </p>
        </div>
        <div className="bg-gradient-to-r from-green-500 to-green-600 p-6 rounded-2xl text-white shadow-xl">
          <h3 className="text-lg font-semibold mb-2">Total Transactions</h3>
          <p className="text-4xl font-bold">{dashboardStats.transactions?.total || allTransactions.transactions?.length || 0}</p>
          <p className="text-green-100 text-sm mt-2">
            {dashboardStats.transactions?.completed || 0} completed
          </p>
        </div>
        <div className="bg-gradient-to-r from-purple-500 to-purple-600 p-6 rounded-2xl text-white shadow-xl">
          <h3 className="text-lg font-semibold mb-2">Transaction Volume</h3>
          <p className="text-4xl font-bold">
            KES {(dashboardStats.transactions?.total_volume || 0).toLocaleString()}
          </p>
          <p className="text-purple-100 text-sm mt-2">All time</p>
        </div>
        <div className="bg-gradient-to-r from-orange-500 to-orange-600 p-6 rounded-2xl text-white shadow-xl">
          <h3 className="text-lg font-semibold mb-2">New Users (7d)</h3>
          <p className="text-4xl font-bold">{dashboardStats.recent_activity?.new_users_7d || 0}</p>
          <p className="text-orange-100 text-sm mt-2">This week</p>
        </div>
      </div>

      {/* User Management Section */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <h3 className="text-2xl font-semibold text-gray-800 dark:text-white flex items-center">
            <span className="mr-3">👥</span>
            User Management
          </h3>
          <button
            onClick={() => setShowCreateUser(true)}
            className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-3 rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all duration-200 font-semibold shadow-lg transform hover:scale-105"
          >
            Create User
          </button>
        </div>

        {/* User Filters */}
        <div className="grid md:grid-cols-3 gap-4 mb-6">
          <select
            value={filters.userRole}
            onChange={(e) => setFilters({...filters, userRole: e.target.value})}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
          >
            <option value="">All Roles</option>
            <option value="customer">Customers</option>
            <option value="admin">Administrators</option>
          </select>
          <select
            value={filters.userActive}
            onChange={(e) => setFilters({...filters, userActive: e.target.value})}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
          >
            <option value="">All Status</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
          <button
            onClick={() => setFilters({userRole: '', userActive: '', transactionStatus: '', transactionType: ''})}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-500 transition-colors"
          >
            Clear Filters
          </button>
        </div>

        {showCreateUser && (
          <div className="mb-6 p-6 bg-gray-50 dark:bg-gray-700 rounded-xl">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-lg font-semibold text-gray-800 dark:text-white">Create New User</h4>
              <button
                onClick={() => setShowCreateUser(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreateUser} className="grid md:grid-cols-2 gap-4">
              <input
                type="email"
                placeholder="Email"
                value={newUser.email}
                onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white"
                required
              />
              <input
                type="text"
                placeholder="Full Name"
                value={newUser.full_name}
                onChange={(e) => setNewUser({...newUser, full_name: e.target.value})}
                className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white"
                required
              />
              <input
                type="tel"
                placeholder="Phone (254XXXXXXXXX)"
                value={newUser.phone}
                onChange={(e) => setNewUser({...newUser, phone: e.target.value})}
                className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white"
                required
              />
              <input
                type="password"
                placeholder="Password"
                value={newUser.password}
                onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white"
                required
              />
              <select
                value={newUser.role}
                onChange={(e) => setNewUser({...newUser, role: e.target.value})}
                className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white"
              >
                <option value="customer">Customer</option>
                <option value="admin">Admin</option>
              </select>
              <div className="flex space-x-2">
                <button
                  type="submit"
                  className="bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-3 rounded-lg hover:from-green-600 hover:to-green-700 transition-all duration-200 font-semibold"
                >
                  Create
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
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-600">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-gray-800 dark:text-white">
                    {user.full_name}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                    {user.email}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300 font-mono">
                    {user.account_number}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                    KES {user.balance?.toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      user.role === 'admin' 
                        ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' 
                        : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      user.is_active 
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                    }`}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => toggleUserStatus(user.id)}
                      className={`px-3 py-1 text-xs rounded-lg transition-colors font-semibold ${
                        user.is_active 
                          ? 'bg-red-500 text-white hover:bg-red-600' 
                          : 'bg-green-500 text-white hover:bg-green-600'
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

        {filteredUsers.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500 dark:text-gray-400">No users match the current filters</p>
          </div>
        )}
      </div>

      {/* Transaction Overview */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-xl">
        <h3 className="text-2xl font-semibold text-gray-800 dark:text-white mb-6 flex items-center">
          <span className="mr-3">💳</span>
          Transaction Overview
        </h3>

        {/* Transaction Filters */}
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <select
            value={filters.transactionStatus}
            onChange={(e) => setFilters({...filters, transactionStatus: e.target.value})}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
          >
            <option value="">All Status</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
          <select
            value={filters.transactionType}
            onChange={(e) => setFilters({...filters, transactionType: e.target.value})}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
          >
            <option value="">All Types</option>
            <option value="transfer">Transfer</option>
            <option value="mpesa_deposit">M-Pesa Deposit</option>
            <option value="deposit">Deposit</option>
            <option value="withdrawal">Withdrawal</option>
          </select>
        </div>

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
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-600">
              {filteredTransactions.slice(0, 20).map((transaction) => (
                <tr key={transaction.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                    {new Date(transaction.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <span className="text-lg mr-2">
                        {transaction.transaction_type === 'transfer' ? '💸' : 
                         transaction.transaction_type?.includes('mpesa') ? '📱' : '💰'}
                      </span>
                      <span className="text-sm font-medium text-gray-800 dark:text-white capitalize">
                        {transaction.transaction_type?.replace('_', ' ')}
                      </span>
                    </div>
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

        {filteredTransactions.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500 dark:text-gray-400">No transactions match the current filters</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;