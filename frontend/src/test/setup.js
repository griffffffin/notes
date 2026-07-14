/* Minden teszt előtt lefut. A jest-dom extra állításokat ad a vizsgálatokhoz
   (pl. toBeVisible, toHaveClass) — ezek nélkül csak nyers DOM-tulajdonságokat
   tudnánk ellenőrizni. */
import "@testing-library/jest-dom/vitest";
import {cleanup} from "@testing-library/react";
import {afterEach} from "vitest";

// Teszt után takarítunk: különben az előző teszt DOM-ja beleszólna a következőbe.
afterEach(cleanup);
