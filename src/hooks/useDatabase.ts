import { useState, useEffect, useCallback } from 'react';
import { cloudStore } from '../services/cloudStore';
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
  Employee,
  EmployeeAttendance,
  EmployeeLeave,
  EmployeePayment,
  Vehicle,
  Driver,
  TripSlip,
  Tyre,
  CashBankAccount,
  InternalTransfer,
  AccountAdjustment,
  StockAdjustmentType,
  ItemStockAdjustment,
  EvidenceFolder,
  EvidenceFile,
} from '../types';

export function useDatabase() {
  const [parties, setParties] = useState<Party[]>(() => cloudStore.getParties());
  const [transactions, setTransactions] = useState<Transaction[]>(() => cloudStore.getTransactions());
  const [settings, setSettings] = useState<CompanySettings>(() => cloudStore.getSettings());
  const [items, setItems] = useState<Item[]>(() => cloudStore.getItems());
  const [categories, setCategories] = useState<ItemCategory[]>(() => cloudStore.getCategories());
  const [units, setUnits] = useState<ItemUnit[]>(() => cloudStore.getUnits());
  const [locations, setLocations] = useState<ItemLocation[]>(() => cloudStore.getLocations());
  const [productionBatches, setProductionBatches] = useState<ProductionBatchRun[]>(() => cloudStore.getProductionBatches());
  const [orders, setOrders] = useState<Order[]>(() => cloudStore.getOrders());
  const [vehicles, setVehicles] = useState<Vehicle[]>(() => cloudStore.getVehicles());
  const [drivers, setDrivers] = useState<Driver[]>(() => cloudStore.getDrivers());
  const [tripSlips, setTripSlips] = useState<TripSlip[]>(() => cloudStore.getTripSlips());
  const [tyres, setTyres] = useState<Tyre[]>(() => cloudStore.getTyres());
  const [employees, setEmployees] = useState<Employee[]>(() => cloudStore.getEmployees());
  const [attendance, setAttendance] = useState<EmployeeAttendance[]>(() => cloudStore.getAttendance());
  const [leaves, setLeaves] = useState<EmployeeLeave[]>(() => cloudStore.getLeaves());
  const [employeePayments, setEmployeePayments] = useState<EmployeePayment[]>(() => cloudStore.getEmployeePayments());
  const [accounts, setAccounts] = useState<CashBankAccount[]>(() => cloudStore.getAccounts());
  const [transfers, setTransfers] = useState<InternalTransfer[]>(() => cloudStore.getTransfers());
  const [adjustments, setAdjustments] = useState<AccountAdjustment[]>(() => cloudStore.getAdjustments());
  const [stockAdjustments, setStockAdjustments] = useState<ItemStockAdjustment[]>(() => cloudStore.getStockAdjustments());
  const [evidenceFolders, setEvidenceFolders] = useState<EvidenceFolder[]>(() => cloudStore.getEvidenceFolders());
  const [evidenceFiles, setEvidenceFiles] = useState<EvidenceFile[]>(() => cloudStore.getEvidenceFiles());
  const [isOnline, setIsOnline] = useState<boolean>(() => cloudStore.isBackendOnline());
  const [lastSync, setLastSync] = useState<string>(() => cloudStore.getLastSyncTime());
  const [isSyncing, setIsSyncing] = useState<boolean>(() => cloudStore.isSyncing());

  const refresh = useCallback(() => {
    setParties(cloudStore.getParties());
    setTransactions(cloudStore.getTransactions());
    setSettings(cloudStore.getSettings());
    setItems(cloudStore.getItems());
    setCategories(cloudStore.getCategories());
    setUnits(cloudStore.getUnits());
    setLocations(cloudStore.getLocations());
    setProductionBatches(cloudStore.getProductionBatches());
    setOrders(cloudStore.getOrders());
    setVehicles(cloudStore.getVehicles());
    setDrivers(cloudStore.getDrivers());
    setTripSlips(cloudStore.getTripSlips());
    setTyres(cloudStore.getTyres());
    setEmployees(cloudStore.getEmployees());
    setAttendance(cloudStore.getAttendance());
    setLeaves(cloudStore.getLeaves());
    setEmployeePayments(cloudStore.getEmployeePayments());
    setAccounts(cloudStore.getAccounts());
    setTransfers(cloudStore.getTransfers());
    setAdjustments(cloudStore.getAdjustments());
    setStockAdjustments(cloudStore.getStockAdjustments());
    setEvidenceFolders(cloudStore.getEvidenceFolders());
    setEvidenceFiles(cloudStore.getEvidenceFiles());
    setIsOnline(cloudStore.isBackendOnline());
    setLastSync(cloudStore.getLastSyncTime());
    setIsSyncing(cloudStore.isSyncing());
  }, []);

  useEffect(() => {
    const unsubscribe = cloudStore.subscribe(() => {
      refresh();
    });
    return () => {
      unsubscribe();
    };
  }, [refresh]);

  const syncNow = useCallback(async (fresh = true) => {
    const result = await cloudStore.syncWithServer(fresh);
    refresh();
    return result;
  }, [refresh]);

  return {
    parties,
    transactions,
    settings,
    items,
    categories,
    units,
    locations,
    productionBatches,
    orders,
    vehicles,
    drivers,
    tripSlips,
    tyres,
    employees,
    attendance,
    leaves,
    employeePayments,
    accounts,
    transfers,
    adjustments,
    stockAdjustments,
    evidenceFolders,
    evidenceFiles,
    isOnline,
    lastSync,
    isSyncing,
    syncNow,
    refresh,
    db: cloudStore,
  };
}


