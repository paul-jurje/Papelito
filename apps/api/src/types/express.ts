// Express module augmentation must use `declare global { namespace Express }`.
// The TypeScript compiler requires the namespace form for ambient merges, and
// the empty `interface User extends SafeUser` is the canonical way to merge
// `SafeUser` into Express's `User` type. Disable the two rules that flag this
// pattern so we keep the conventional declaration without lint noise.
/* eslint-disable @typescript-eslint/no-namespace, @typescript-eslint/no-empty-object-type */
import type { User } from './index.js';

export type SafeUser = Omit<User, 'passwordHash'>;

export function toSafeUser(user: User): SafeUser {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

declare global {
  namespace Express {
    // The user populated by Passport on `req.user` after authentication.
    // We use the domain `User` shape (no password hash) since this is the
    // user-facing representation.
    interface User extends SafeUser {}
  }
}

export {};
/* eslint-enable @typescript-eslint/no-namespace, @typescript-eslint/no-empty-object-type */
