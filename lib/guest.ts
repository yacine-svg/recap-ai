/*
 * Guest mode: the whole app works without an account or the database, e.g.
 * while the Supabase project is paused. Recaps are kept in the visitor's
 * browser (localStorage) and the server runs each step statelessly.
 *
 * Turn on with NEXT_PUBLIC_GUEST_MODE=on (read at build time, so redeploy after changing it).
 */
export const GUEST_MODE = process.env.NEXT_PUBLIC_GUEST_MODE === "on";
