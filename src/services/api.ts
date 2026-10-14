import {
  Party,
  Transaction,
  CompanySettings,
  Item,
  ItemCategory,
  ItemUnit,
  ItemLocation,
  ProductionBatchRun,
  Order,
  Vehicle,
  Driver,
  TripSlip,
  Tyre,
  Employee,
  EmployeeAttendance,
  EmployeeLeave,
  EmployeePayment,
  ItemStockAdjustment,
  CashBankAccount,
  InternalTransfer,
  AccountAdjustment,
  AppUser,
  UserRole,
  UserPermissions,
  UserStatus,
} from '../types';

export interface HealthResponse {
  status: string;
  timestamp: string;
  uptimeSeconds: number;
  database: {
    type: string;
    storageEngine: string;
    filePath: string;
    fileSizeKb: number;
    lastUpdated: string;
    collectionCounts: Record<string, number>;
  };
  system: {
    nodeVersion: string;
    platform: string;
    memoryMb: number;
  };
}

export interface AnalyticsResponse {
  financials: {
    totalReceivables: number;
    totalPayables: number;
    netCashPosition: number;
    totalSales: number;
    totalPurchases: number;
    inventoryValuation: number;
  };
  operations: {
    totalBatchesCount: number;
    totalProductionTonnes: number;
    activeFleetCount: number;
    totalFleetCount: number;
    fleetUtilizationRate: number;
    pendingOrdersCount: number;
    activeEmployeesCount: number;
  };
  topCustomers: Party[];
  topSuppliers: Party[];
}

export interface SyncPayload {
  version: string;
  lastUpdated: string;
  settings: CompanySettings;
  parties: Party[];
  transactions: Transaction[];
  items: Item[];
  categories: ItemCategory[];
  units: ItemUnit[];
  locations: ItemLocation[];
  productionBatches: ProductionBatchRun[];
  orders: Order[];
  vehicles: Vehicle[];
  drivers: Driver[];
  tripSlips: TripSlip[];
  tyres: Tyre[];
  employees: Employee[];
  attendance: EmployeeAttendance[];
  leaves: EmployeeLeave[];
  employeePayments: EmployeePayment[];
  accounts?: any[];
  transfers?: any[];
  adjustments?: any[];
  stockAdjustments?: ItemStockAdjustment[];
  evidenceFolders?: any[];
  evidenceFiles?: any[];
  auditLogs: any[];
}

class ApiClient {
  private baseUrl = '/api';
  private token: string | null = typeof window !== 'undefined' ? localStorage.getItem('ops_auth_token') : null;

  public setToken(token: string | null) {
    this.token = token;
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem('ops_auth_token', token);
      } else {
        localStorage.removeItem('ops_auth_token');
      }
    }
  }

  public getToken(): string | null {
    return this.token;
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options?.headers as Record<string, string>),
      };

      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }

      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error: any) {
      console.warn(`[ApiClient] Request to ${endpoint} failed:`, error.message);
      throw error;
    }
  }

  // ==========================================
  // AUTHENTICATION
  // ==========================================
  public async login(credentials: { username: string; password: string }): Promise<{
    success: boolean;
    token: string;
    user: AppUser;
    message: string;
  }> {
    const res = await this.request<{
      success: boolean;
      token: string;
      user: AppUser;
      message: string;
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    if (res.token) {
      this.setToken(res.token);
    }
    return res;
  }

  public async verifySetup(username: string): Promise<{
    success: boolean;
    eligible: boolean;
    user: { id: string; fullName: string; username: string; email: string; role: string };
  }> {
    return this.request('/auth/verify-setup', {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
  }

  public async setupPassword(payload: {
    username: string;
    password: string;
    activationCode?: string;
  }): Promise<{
    success: boolean;
    token: string;
    user: AppUser;
    message: string;
  }> {
    const res = await this.request<{
      success: boolean;
      token: string;
      user: AppUser;
      message: string;
    }>('/auth/setup-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.token) {
      this.setToken(res.token);
    }
    return res;
  }

  public async getMe(): Promise<{ success: boolean; user: AppUser }> {
    return this.request<{ success: boolean; user: AppUser }>('/auth/me');
  }

  public async changePassword(payload: { currentPassword: string; newPassword: string }): Promise<{ success: boolean; message: string }> {
    return this.request('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // ==========================================
  // USER MANAGEMENT
  // ==========================================
  public async getUsers(fresh = false): Promise<{ success: boolean; count: number; data: AppUser[] }> {
    return this.request<{ success: boolean; count: number; data: AppUser[] }>(fresh ? '/users?fresh=true' : '/users');
  }

  public async previewUsername(fullName: string, role?: string): Promise<{
    success: boolean;
    suggestedUsername: string;
    suggestedActivationCode: string;
  }> {
    const query = new URLSearchParams();
    if (fullName) query.set('fullName', fullName);
    if (role) query.set('role', role);
    return this.request(`/users/preview-username?${query.toString()}`);
  }

  public async createUser(payload: {
    fullName: string;
    email: string;
    phone?: string;
    role: UserRole;
    permissions: UserPermissions;
    notes?: string;
    customUsername?: string;
  }): Promise<{ success: boolean; data: AppUser; message: string }> {
    return this.request('/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async updateUser(id: string, payload: Partial<AppUser>): Promise<{ success: boolean; data: AppUser; message: string }> {
    return this.request(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  public async resetUserInvite(id: string): Promise<{ success: boolean; data: AppUser; message: string }> {
    return this.request(`/users/${id}/reset-invite`, {
      method: 'PATCH',
    });
  }

  public async updateUserStatus(id: string, status: UserStatus): Promise<{ success: boolean; data: AppUser; message: string }> {
    return this.request(`/users/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  public async deleteUser(id: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/users/${id}`, {
      method: 'DELETE',
    });
  }


  // System & Health
  public async getHealth(): Promise<HealthResponse> {
    return this.request<HealthResponse>('/health');
  }

  public async syncAll(fresh = false): Promise<{ success: boolean; data: SyncPayload }> {
    return this.request<{ success: boolean; data: SyncPayload }>(fresh ? '/sync?fresh=true' : '/sync');
  }

  // Settings
  public async getSettings(): Promise<{ success: boolean; data: CompanySettings }> {
    return this.request<{ success: boolean; data: CompanySettings }>('/settings');
  }

  public async updateSettings(settings: Partial<CompanySettings>): Promise<{ success: boolean; data: CompanySettings }> {
    return this.request<{ success: boolean; data: CompanySettings }>('/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  // Parties
  public async getParties(params?: { type?: string; category?: string; q?: string }): Promise<{ success: boolean; count: number; data: Party[] }> {
    const query = new URLSearchParams();
    if (params?.type) query.set('type', params.type);
    if (params?.category) query.set('category', params.category);
    if (params?.q) query.set('q', params.q);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return this.request<{ success: boolean; count: number; data: Party[] }>(`/parties${qs}`);
  }

  public async getParty(id: string): Promise<{ success: boolean; data: Party & { transactions: Transaction[] } }> {
    return this.request<{ success: boolean; data: Party & { transactions: Transaction[] } }>(`/parties/${id}`);
  }

  public async createParty(party: Partial<Party>): Promise<{ success: boolean; data: Party }> {
    return this.request<{ success: boolean; data: Party }>('/parties', {
      method: 'POST',
      body: JSON.stringify(party),
    });
  }

  public async createPartiesBulk(parties: Array<Partial<Party>>): Promise<{
    success: boolean;
    count: number;
    message: string;
    data: Party[];
  }> {
    return this.request<{
      success: boolean;
      count: number;
      message: string;
      data: Party[];
    }>('/parties/bulk', {
      method: 'POST',
      body: JSON.stringify({ parties }),
    });
  }

  public async updateParty(id: string, updates: Partial<Party>): Promise<{ success: boolean; data: Party }> {
    return this.request<{ success: boolean; data: Party }>(`/parties/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  public async deleteParty(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/parties/${id}`, {
      method: 'DELETE',
    });
  }

  // Transactions
  public async getTransactions(params?: { partyId?: string; type?: string; status?: string }): Promise<{ success: boolean; count: number; data: Transaction[] }> {
    const query = new URLSearchParams();
    if (params?.partyId) query.set('partyId', params.partyId);
    if (params?.type) query.set('type', params.type);
    if (params?.status) query.set('status', params.status);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return this.request<{ success: boolean; count: number; data: Transaction[] }>(`/transactions${qs}`);
  }

  public async createTransaction(txn: Partial<Transaction>): Promise<{ success: boolean; data: Transaction }> {
    return this.request<{ success: boolean; data: Transaction }>('/transactions', {
      method: 'POST',
      body: JSON.stringify(txn),
    });
  }

  public async updateTransaction(id: string, updates: Partial<Transaction>): Promise<{ success: boolean; data: Transaction }> {
    return this.request<{ success: boolean; data: Transaction }>(`/transactions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  public async deleteTransaction(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/transactions/${id}`, {
      method: 'DELETE',
    });
  }

  // Items
  public async getItems(): Promise<{ success: boolean; data: Item[] }> {
    return this.request<{ success: boolean; data: Item[] }>('/items');
  }

  public async createItem(item: Partial<Item>): Promise<{ success: boolean; data: Item }> {
    return this.request<{ success: boolean; data: Item }>('/items', {
      method: 'POST',
      body: JSON.stringify(item),
    });
  }

  public async updateItem(id: string, updates: Partial<Item>): Promise<{ success: boolean; data: Item }> {
    return this.request<{ success: boolean; data: Item }>(`/items/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  public async deleteItem(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/items/${id}`, {
      method: 'DELETE',
    });
  }

  public async adjustStock(id: string, delta: number, logType: string, refNo?: string, notes?: string): Promise<{ success: boolean; data: Item }> {
    return this.request<{ success: boolean; data: Item }>(`/items/${id}/adjust-stock`, {
      method: 'POST',
      body: JSON.stringify({ delta, logType, referenceNumber: refNo, notes }),
    });
  }

  // Categories, Units, Locations
  public async getCategories(): Promise<{ success: boolean; data: ItemCategory[] }> {
    return this.request<{ success: boolean; data: ItemCategory[] }>('/categories');
  }
  public async createCategory(category: Partial<ItemCategory>): Promise<{ success: boolean; data: ItemCategory }> {
    return this.request<{ success: boolean; data: ItemCategory }>('/categories', {
      method: 'POST',
      body: JSON.stringify(category),
    });
  }
  public async updateCategory(id: string, updates: Partial<ItemCategory>): Promise<{ success: boolean; data: ItemCategory }> {
    return this.request<{ success: boolean; data: ItemCategory }>(`/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }
  public async deleteCategory(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/categories/${id}`, {
      method: 'DELETE',
    });
  }

  public async getUnits(): Promise<{ success: boolean; data: ItemUnit[] }> {
    return this.request<{ success: boolean; data: ItemUnit[] }>('/units');
  }
  public async createUnit(unit: Partial<ItemUnit>): Promise<{ success: boolean; data: ItemUnit }> {
    return this.request<{ success: boolean; data: ItemUnit }>('/units', {
      method: 'POST',
      body: JSON.stringify(unit),
    });
  }
  public async updateUnit(id: string, updates: Partial<ItemUnit>): Promise<{ success: boolean; data: ItemUnit }> {
    return this.request<{ success: boolean; data: ItemUnit }>(`/units/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }
  public async deleteUnit(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/units/${id}`, {
      method: 'DELETE',
    });
  }

  public async getLocations(): Promise<{ success: boolean; data: ItemLocation[] }> {
    return this.request<{ success: boolean; data: ItemLocation[] }>('/locations');
  }
  public async createLocation(location: Partial<ItemLocation>): Promise<{ success: boolean; data: ItemLocation }> {
    return this.request<{ success: boolean; data: ItemLocation }>('/locations', {
      method: 'POST',
      body: JSON.stringify(location),
    });
  }
  public async updateLocation(id: string, updates: Partial<ItemLocation>): Promise<{ success: boolean; data: ItemLocation }> {
    return this.request<{ success: boolean; data: ItemLocation }>(`/locations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }
  public async deleteLocation(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/locations/${id}`, {
      method: 'DELETE',
    });
  }

  // Stock Adjustments
  public async getStockAdjustments(): Promise<{ success: boolean; data: ItemStockAdjustment[] }> {
    return this.request<{ success: boolean; data: ItemStockAdjustment[] }>('/stock-adjustments');
  }

  public async createStockAdjustment(adj: Partial<ItemStockAdjustment>): Promise<{ success: boolean; data: ItemStockAdjustment }> {
    return this.request<{ success: boolean; data: ItemStockAdjustment }>('/stock-adjustments', {
      method: 'POST',
      body: JSON.stringify(adj),
    });
  }

  public async deleteStockAdjustment(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/stock-adjustments/${id}`, {
      method: 'DELETE',
    });
  }

  // Orders
  public async getOrders(): Promise<{ success: boolean; data: Order[] }> {
    return this.request<{ success: boolean; data: Order[] }>('/orders');
  }

  public async createOrder(order: Partial<Order>): Promise<{ success: boolean; data: Order }> {
    return this.request<{ success: boolean; data: Order }>('/orders', {
      method: 'POST',
      body: JSON.stringify(order),
    });
  }

  public async updateOrder(id: string, updates: Partial<Order>): Promise<{ success: boolean; data: Order }> {
    return this.request<{ success: boolean; data: Order }>(`/orders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  public async deleteOrder(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/orders/${id}`, {
      method: 'DELETE',
    });
  }

  // Production Batches
  public async getBatches(): Promise<{ success: boolean; data: ProductionBatchRun[] }> {
    return this.request<{ success: boolean; data: ProductionBatchRun[] }>('/batches');
  }

  public async createBatch(batch: Partial<ProductionBatchRun>): Promise<{ success: boolean; data: ProductionBatchRun }> {
    return this.request<{ success: boolean; data: ProductionBatchRun }>('/batches', {
      method: 'POST',
      body: JSON.stringify(batch),
    });
  }

  public async updateBatch(id: string, updates: Partial<ProductionBatchRun>): Promise<{ success: boolean; data: ProductionBatchRun }> {
    return this.request<{ success: boolean; data: ProductionBatchRun }>(`/batches/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  public async deleteBatch(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/batches/${id}`, {
      method: 'DELETE',
    });
  }

  // Logistics (Vehicles, Drivers, Trip Slips, Tyres)
  public async getVehicles(): Promise<{ success: boolean; data: Vehicle[] }> {
    return this.request<{ success: boolean; data: Vehicle[] }>('/logistics/vehicles');
  }

  public async createVehicle(vehicle: Partial<Vehicle>): Promise<{ success: boolean; data: Vehicle }> {
    return this.request<{ success: boolean; data: Vehicle }>('/logistics/vehicles', {
      method: 'POST',
      body: JSON.stringify(vehicle),
    });
  }

  public async updateVehicle(id: string, updates: Partial<Vehicle>): Promise<{ success: boolean; data: Vehicle }> {
    return this.request<{ success: boolean; data: Vehicle }>(`/logistics/vehicles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  public async deleteVehicle(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/logistics/vehicles/${id}`, {
      method: 'DELETE',
    });
  }

  public async getDrivers(): Promise<{ success: boolean; data: Driver[] }> {
    return this.request<{ success: boolean; data: Driver[] }>('/logistics/drivers');
  }

  public async createDriver(driver: Partial<Driver>): Promise<{ success: boolean; data: Driver }> {
    return this.request<{ success: boolean; data: Driver }>('/logistics/drivers', {
      method: 'POST',
      body: JSON.stringify(driver),
    });
  }

  public async updateDriver(id: string, updates: Partial<Driver>): Promise<{ success: boolean; data: Driver }> {
    return this.request<{ success: boolean; data: Driver }>(`/logistics/drivers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  public async deleteDriver(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/logistics/drivers/${id}`, {
      method: 'DELETE',
    });
  }

  public async getTripSlips(): Promise<{ success: boolean; data: TripSlip[] }> {
    return this.request<{ success: boolean; data: TripSlip[] }>('/logistics/trip-slips');
  }

  public async createTripSlip(slip: Partial<TripSlip>): Promise<{ success: boolean; data: TripSlip }> {
    return this.request<{ success: boolean; data: TripSlip }>('/logistics/trip-slips', {
      method: 'POST',
      body: JSON.stringify(slip),
    });
  }

  public async updateTripSlip(id: string, updates: Partial<TripSlip>): Promise<{ success: boolean; data: TripSlip }> {
    return this.request<{ success: boolean; data: TripSlip }>(`/logistics/trip-slips/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  public async deleteTripSlip(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/logistics/trip-slips/${id}`, {
      method: 'DELETE',
    });
  }

  public async getTyres(): Promise<{ success: boolean; data: Tyre[] }> {
    return this.request<{ success: boolean; data: Tyre[] }>('/logistics/tyres');
  }

  public async createTyre(tyre: Partial<Tyre>): Promise<{ success: boolean; data: Tyre }> {
    return this.request<{ success: boolean; data: Tyre }>('/logistics/tyres', {
      method: 'POST',
      body: JSON.stringify(tyre),
    });
  }

  public async updateTyre(id: string, updates: Partial<Tyre>): Promise<{ success: boolean; data: Tyre }> {
    return this.request<{ success: boolean; data: Tyre }>(`/logistics/tyres/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  public async deleteTyre(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/logistics/tyres/${id}`, {
      method: 'DELETE',
    });
  }

  // Employees & HR
  public async getEmployees(): Promise<{ success: boolean; data: Employee[] }> {
    return this.request<{ success: boolean; data: Employee[] }>('/employees/staff');
  }

  public async createEmployee(emp: Partial<Employee>): Promise<{ success: boolean; data: Employee }> {
    return this.request<{ success: boolean; data: Employee }>('/employees/staff', {
      method: 'POST',
      body: JSON.stringify(emp),
    });
  }

  public async updateEmployee(id: string, updates: Partial<Employee>): Promise<{ success: boolean; data: Employee }> {
    return this.request<{ success: boolean; data: Employee }>(`/employees/staff/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  public async deleteEmployee(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/employees/staff/${id}`, {
      method: 'DELETE',
    });
  }

  public async getAttendance(): Promise<{ success: boolean; data: EmployeeAttendance[] }> {
    return this.request<{ success: boolean; data: EmployeeAttendance[] }>('/employees/attendance');
  }

  public async recordAttendance(attendance: Partial<EmployeeAttendance>): Promise<{ success: boolean; data: EmployeeAttendance }> {
    return this.request<{ success: boolean; data: EmployeeAttendance }>('/employees/attendance', {
      method: 'POST',
      body: JSON.stringify(attendance),
    });
  }

  public async getLeaves(): Promise<{ success: boolean; data: EmployeeLeave[] }> {
    return this.request<{ success: boolean; data: EmployeeLeave[] }>('/employees/leaves');
  }

  public async applyLeave(leave: Partial<EmployeeLeave>): Promise<{ success: boolean; data: EmployeeLeave }> {
    return this.request<{ success: boolean; data: EmployeeLeave }>('/employees/leaves', {
      method: 'POST',
      body: JSON.stringify(leave),
    });
  }

  public async getEmployeePayments(): Promise<{ success: boolean; data: EmployeePayment[] }> {
    return this.request<{ success: boolean; data: EmployeePayment[] }>('/employees/payments');
  }

  public async addEmployeePayment(payment: Partial<EmployeePayment>): Promise<{ success: boolean; data: EmployeePayment }> {
    return this.request<{ success: boolean; data: EmployeePayment }>('/employees/payments', {
      method: 'POST',
      body: JSON.stringify(payment),
    });
  }

  // Cash & Bank Management
  public async getAccounts(): Promise<{ success: boolean; data: CashBankAccount[] }> {
    return this.request<{ success: boolean; data: CashBankAccount[] }>('/accounts');
  }

  public async getAccountById(id: string): Promise<{ success: boolean; data: CashBankAccount }> {
    return this.request<{ success: boolean; data: CashBankAccount }>(`/accounts/${id}`);
  }

  public async createAccount(accountData: Partial<CashBankAccount>): Promise<{ success: boolean; data: CashBankAccount }> {
    return this.request<{ success: boolean; data: CashBankAccount }>('/accounts', {
      method: 'POST',
      body: JSON.stringify(accountData),
    });
  }

  public async updateAccount(id: string, updates: Partial<CashBankAccount>): Promise<{ success: boolean; data: CashBankAccount }> {
    return this.request<{ success: boolean; data: CashBankAccount }>(`/accounts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  public async deleteAccount(id: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(`/accounts/${id}`, {
      method: 'DELETE',
    });
  }

  public async recalculateAccount(id: string): Promise<{ success: boolean; data: CashBankAccount }> {
    return this.request<{ success: boolean; data: CashBankAccount }>(`/accounts/${id}/recalculate`, {
      method: 'POST',
    });
  }

  // Internal Transfers
  public async getTransfers(): Promise<{ success: boolean; data: InternalTransfer[] }> {
    return this.request<{ success: boolean; data: InternalTransfer[] }>('/transfers');
  }

  public async createTransfer(transferData: Partial<InternalTransfer>): Promise<{ success: boolean; data: InternalTransfer }> {
    return this.request<{ success: boolean; data: InternalTransfer }>('/transfers', {
      method: 'POST',
      body: JSON.stringify(transferData),
    });
  }

  public async deleteTransfer(id: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(`/transfers/${id}`, {
      method: 'DELETE',
    });
  }

  // Account Adjustments
  public async getAdjustments(): Promise<{ success: boolean; data: AccountAdjustment[] }> {
    return this.request<{ success: boolean; data: AccountAdjustment[] }>('/adjustments');
  }

  public async createAdjustment(adjData: Partial<AccountAdjustment>): Promise<{ success: boolean; data: AccountAdjustment }> {
    return this.request<{ success: boolean; data: AccountAdjustment }>('/adjustments', {
      method: 'POST',
      body: JSON.stringify(adjData),
    });
  }

  public async deleteAdjustment(id: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(`/adjustments/${id}`, {
      method: 'DELETE',
    });
  }

  // Analytics
  public async getAnalytics(): Promise<{ success: boolean; data: AnalyticsResponse }> {
    return this.request<{ success: boolean; data: AnalyticsResponse }>('/analytics/summary');
  }

  // Backup & Reset
  public async resetDatabase(): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>('/backup/reset', {
      method: 'POST',
    });
  }

  public async purgeDemoData(): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>('/backup/purge-demo', {
      method: 'POST',
    });
  }

  public async exportBackup(): Promise<any> {
    return this.request<any>('/backup/export');
  }

  public async restoreBackup(payload: any): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>('/backup/restore', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // Cloud MySQL & Cloud Storage Endpoints
  public async getCloudStatus(): Promise<{ success: boolean; data: any }> {
    return this.request<{ success: boolean; data: any }>('/cloud/status');
  }

  public async testMysqlConnection(): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>('/cloud/test-connection', {
      method: 'POST',
    });
  }

  public async testStorageConnection(): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>('/cloud/test-storage', {
      method: 'POST',
    });
  }

  public async runMysqlMigrations(): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>('/cloud/run-migrations', {
      method: 'POST',
    });
  }

  public async seedMysqlFromLocal(): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>('/cloud/seed-from-local', {
      method: 'POST',
    });
  }

  public async getPresignedUploadUrl(filePath: string, contentType: string): Promise<{ success: boolean; data?: any; fallbackMode?: boolean; message?: string }> {
    return this.request<{ success: boolean; data?: any; fallbackMode?: boolean; message?: string }>('/cloud/storage/presigned-url', {
      method: 'POST',
      body: JSON.stringify({ filePath, contentType }),
    });
  }

  public async testTransactions(workersCount: number = 10): Promise<{
    success: boolean;
    transactionsExecuted: number;
    totalDurationMs: number;
    avgDurationPerTxMs: number;
    executedOnAzure: boolean;
    concurrencyPassed: boolean;
    message: string;
  }> {
    return this.request('/cloud/test-transactions', {
      method: 'POST',
      body: JSON.stringify({ workersCount }),
    });
  }
}

export const api = new ApiClient();
