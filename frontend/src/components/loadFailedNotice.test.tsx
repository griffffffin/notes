import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe, expect, it, vi} from "vitest";
import LoadFailedNotice from "./loadFailedNotice";

/* A JELZÉS GOMB-FELIRATA — mert ez okozott egy valós, félrevezető állapotot.
   A kijelentkezés bukásakor a jelzés az „Adatok ismételt lekérése" feliratot
   mutatta, holott ott semmilyen adat nem jön be: az „Újra" a munkamenet
   visszavonását ismétli. A felirat innentől felülírható; ez a teszt rögzíti,
   hogy az alapérték megmarad az adatlekérős nézeteknek, a hívó viszont a
   művelet természetéhez igazíthatja (l. components/app.tsx, retryLabel). */
describe("LoadFailedNotice", () => {
    it("alapból az adatlekérős feliratot mutatja", () => {
        render(<LoadFailedNotice message="A lista most nem érhető el." onRetry={() => {}}/>);
        expect(screen.getByRole("button")).toHaveTextContent("Adatok ismételt lekérése");
    });

    it("a megadott retryLabel felülírja az alapfeliratot", () => {
        render(<LoadFailedNotice message="A kijelentkezés nem fejeződött be."
                                 onRetry={() => {}} retryLabel="Kijelentkezés újra"/>);
        expect(screen.getByRole("button")).toHaveTextContent("Kijelentkezés újra");
        // Az alapfelirat NEM szivárog át — különben a felülírás csak látszólagos volna.
        expect(screen.queryByText("Adatok ismételt lekérése")).toBeNull();
    });

    it("a gomb az onRetry-t hívja", async () => {
        const onRetry = vi.fn();
        render(<LoadFailedNotice message="A szerkesztő most nem tölthető be." onRetry={onRetry}/>);
        await userEvent.click(screen.getByRole("button"));
        expect(onRetry).toHaveBeenCalledTimes(1);
    });
});
