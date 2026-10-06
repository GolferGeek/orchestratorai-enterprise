import { Injectable } from '@nestjs/common';

/**
 * Which of the company's customer accounts a signed-in person may let an
 * agent act for, on "Log in with <company>".
 *
 * Who the person is comes from the auth plane (AUTH_SERVICE), whatever it is
 * configured as: Supabase, Auth0, Azure or Google. This is only the mapping
 * from that person to customer accounts, which lives in the company's own
 * records, so it is pluggable: CUSTOMER_ACCOUNTS. A client copy provides its
 * own (Neuromics: the person's clients in its company database, read through
 * BUSINESS_DATABASE_SERVICE).
 */
export const CUSTOMER_ACCOUNTS = Symbol('CUSTOMER_ACCOUNTS');

/** The person, as the auth plane signed them in. */
export interface SignedInPerson {
  /** The platform's user id for them. */
  userId: string;
  email: string | null;
  displayName: string | null;
}

export interface CustomerAccount {
  /** The account's id in the company's own records (a grant's account_ref). */
  ref: string;
  label: string;
}

export interface CustomerAccountDirectory {
  /** The accounts this person may act for in this org; empty when none. */
  accountsFor(person: SignedInPerson, orgSlug: string): Promise<CustomerAccount[]>;
}

/**
 * Enterprise's mapping: each person is their own customer account. Enterprise
 * has no separate customer records, so the account is the signed-in person.
 */
@Injectable()
export class SelfAsCustomerAccount implements CustomerAccountDirectory {
  accountsFor(person: SignedInPerson): Promise<CustomerAccount[]> {
    const label = person.displayName ?? person.email;
    if (!label) throw new Error(`User ${person.userId} has neither a name nor an email to show as their account`);
    return Promise.resolve([{ ref: `user:${person.userId}`, label }]);
  }
}
