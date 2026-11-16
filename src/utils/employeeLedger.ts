import { Employee, EmployeeLedgerTransaction, EmployeePayment } from '../types';

/** One employee's current ledger balance — the same fold the ledger table
 *  shows: master opening + accruals/adds (+), paid-to-employee (−) and legacy
 *  payroll payouts (−); direct rows are balance-neutral.
 *  (Lives in utils, not in the view component — Fast Refresh requires
 *  component files to export components only.) */
export function employeeLedgerBalance(
  emp: Employee,
  txns: EmployeeLedgerTransaction[],
  payments: EmployeePayment[]
): number {
  let bal = Number(emp.openingBalance) || 0;
  txns.forEach((t) => {
    if (t.employeeId !== emp.id) return;
    if (t.type === 'wage_accrual' || t.type === 'add_balance') bal += t.amount;
    else if (t.type === 'reduce_balance') bal -= t.amount;
  });
  payments.forEach((p) => {
    if (p.employeeId === emp.id) bal -= Number(p.amount) || 0;
  });
  return Math.round(bal * 100) / 100;
}
