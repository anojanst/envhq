import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

/**
 * Setup for the `ui` vitest project (RM-9).
 *
 * `cleanup` between tests is the whole file: React Testing Library leaves the
 * mounted tree in the document otherwise, and with a 500-row fixture the
 * leftovers make the next test's queries both slow and ambiguous.
 */
afterEach(cleanup);
