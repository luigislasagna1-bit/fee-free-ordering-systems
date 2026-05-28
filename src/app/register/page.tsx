/**
 * /register — permanent redirect to /signup.
 *
 * Some users (and some prior docs / agent responses) used `/register` to
 * refer to the restaurant-owner signup page, but the real route has
 * always been `/signup`. This shim keeps any stale links / muscle memory
 * working instead of dropping users on a 404.
 */
import { redirect } from "next/navigation";

export default function RegisterAliasPage() {
  redirect("/signup");
}
