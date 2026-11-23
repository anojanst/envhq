import { redirect } from "next/navigation";

// There is no separate sign-up: the sign-in provider decides who may have an
// account, and a first sign-in creates it. Kept so old links still land.
export default function SignUpPage() {
  redirect("/sign-in");
}
