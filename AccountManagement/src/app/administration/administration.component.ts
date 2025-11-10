import { Component, OnInit } from '@angular/core';
import { Account } from '../../models/account';
import { AuthService } from '../AuthService';
import { ApiService } from '../../services/apiService';
import { TransactionService, TransactionType } from '../../services/transactionService';
import { AccountType } from '../../enums/accountType';

@Component({
  selector: 'app-administration',
  templateUrl: './administration.component.html',
  styleUrls: ['./administration.component.scss']
})
export class AdministrationComponent implements OnInit {
  accounts: Account[] = [];
  columns: Array<keyof Account> = [];
  userId = 0;

  showTransactionForm = false;
  transactionType: TransactionType = 'deposit';
  selectedAccount!: Account;
  transactionAmount = 0;

  showTransferForm = false;
  transferAmount = 0;
  transferTargetAccountNumber!: number;

  constructor(
    private auth: AuthService,
    private apiService: ApiService,
    private txService: TransactionService
  ) {}

  ngOnInit() {
    this.userId = this.auth.currentUserId ?? 0;
    this.loadAccounts();
  }

  private loadAccounts() {
    this.apiService.getUserAccounts(this.userId).subscribe({
      next: res => {
        if (res.success) {
          this.accounts = res.accounts;
          if (this.accounts.length) {
            this.columns = Object.keys(this.accounts[0]) as Array<keyof Account>;
          }
        }
      },
      error: err => console.error('Konto-Laden fehlgeschlagen', err)
    });
  }

  deposit(account: Account) {
    this.cancelTransfer();
    this.openTransactionForm(account, 'deposit');
  }

  withdraw(account: Account) {
    this.cancelTransfer();
    this.openTransactionForm(account, 'withdraw');
  }

  private openTransactionForm(account: Account, type: TransactionType) {
    this.selectedAccount = account;
    this.transactionType = type;
    this.transactionAmount = 0;
    this.showTransactionForm = true;
  }

  confirmTransaction() {
    const { accountBalance = 0, overdraftLimit = 0, accountType } = this.selectedAccount;

    if (
      accountType === AccountType.Giro &&
      !this.txService.checkAccountBalance(
        accountBalance,
        this.transactionAmount,
        this.transactionType,
        overdraftLimit
      )
    ) {
      alert('Das Limit zum Überziehen des Kontos ist erreicht!');
      return;
    }

    this.txService
      .processTransaction(
        this.selectedAccount.accountNumber!,
        this.transactionAmount,
        this.transactionType
      )
      .subscribe({
        next: res => {
          if (res.success && res.account) {
            const idx = this.accounts.findIndex(
              a => a.accountNumber === res.account.accountNumber
            );
            if (idx > -1) {
              this.accounts[idx].accountBalance = res.account.accountBalance;
            }
          }
          this.cancelTransaction();
        },
        error: err => console.error('Transaktion fehlgeschlagen', err)
      });
  }

  cancelTransaction() {
    this.showTransactionForm = false;
  }

  transfer(account: Account) {
    this.cancelTransaction();
    this.selectedAccount = account;
    this.transferAmount = 0;
    this.transferTargetAccountNumber = 0;
    this.showTransferForm = true;
  }

  confirmTransfer() {
    const { accountBalance = 0, overdraftLimit = 0 } = this.selectedAccount;

    if (
      !this.txService.checkAccountBalance(
        accountBalance,
        this.transferAmount,
        'withdraw',
        overdraftLimit
      )
    ) {
      alert('Überziehungslimit des Quellkontos erreicht!');
      return;
    }

    this.txService
      .transfer(
        this.selectedAccount.accountNumber!,
        this.transferTargetAccountNumber,
        this.transferAmount
      )
      .subscribe({
        next: res => {
          if (res.success) {
            const srcIdx = this.accounts.findIndex(
              a => a.accountNumber === res.sourceAccount.accountNumber
            );
            if (srcIdx > -1) {
              this.accounts[srcIdx].accountBalance = res.sourceAccount.accountBalance;
            }
            const tgtIdx = this.accounts.findIndex(
              a => a.accountNumber === res.targetAccount.accountNumber
            );
            if (tgtIdx > -1) {
              this.accounts[tgtIdx].accountBalance = res.targetAccount.accountBalance;
            } else {
              this.accounts.push(res.targetAccount);
            }
          }
          this.cancelTransfer();
        },
        error: err => {
          console.error('Überweisung fehlgeschlagen', err);
          alert('Fehler bei der Überweisung!');
        }
      });
  }

  cancelTransfer() {
    this.showTransferForm = false;
  }
}
