import {render, screen, waitFor} from "@testing-library/react";
import {MemoryRouter} from "react-router-dom";
import {beforeEach, describe, expect, it, vi} from "vitest";
import Read from "./read";

/* A Context-mock ÁLLANDÓ objektumot adjon vissza: a komponens effektje a
   handleAxios azonosságára van felfüggesztve, így egy rendernként újra gyártott
   függvény végtelen újratöltő ciklust okozna. */
const {handleAxios, auth} = vi.hoisted(() => {
    const fn = vi.fn();
    return {handleAxios: fn, auth: {isLoggedIn: true, handleAxios: fn}};
});
vi.mock("../../contexts/auth", () => ({useAuth: () => auth}));
vi.mock("../../contexts/theme", () => ({useTheme: () => ({color: "theme", colorHex: "#ffc107"})}));

/* A sorszámok SZÁNDÉKOSAN nem 1,2,3: egy szűrt nézetben (kategória/szín) a
   lista részhalmaz, tehát a sorszámok hézagosak. A húzásnak ott is helyesen
   kell működnie — épp ezért nem az indexet küldjük a szervernek. */
const TODOS = [
    {_id: "a", title: "Alma", color: "warning", category: "x", order: 2, percentage: 0, tasks: {}, taskOrder: []},
    {_id: "b", title: "Banán", color: "warning", category: "x", order: 5, percentage: 0, tasks: {}, taskOrder: []},
    {_id: "c", title: "Cékla", color: "warning", category: "x", order: 9, percentage: 0, tasks: {}, taskOrder: []},
];

const renderRead = () => render(
    <MemoryRouter><Read url="/" handleLinkClicked={vi.fn()}/></MemoryRouter>
);

beforeEach(() => {
    handleAxios.mockReset();
    handleAxios.mockImplementation((url, data, then) => {
        if (url === "/") then({data: TODOS});
        else then({status: 200, data: {}});
        return Promise.resolve();
    });
});

describe("Read", () => {
    it("kilistázza a to-dókat", async () => {
        renderRead();
        expect(await screen.findByText("Alma")).toBeVisible();
        expect(screen.getByText("Cékla")).toBeVisible();
    });

    it("a kártyák a húzáshoz szükséges kapaszkodót megkapják", async () => {
        renderRead();
        await screen.findByText("Alma");
        // A dnd-kit a húzható elemekre teszi ki ezt a szerepet.
        expect(document.querySelectorAll("[role='button'][aria-roledescription]").length).toBe(3);
    });

    /* Magát a levágást nem tudjuk itt ellenőrizni: a jsdom nem számol
       elrendezést, tehát nincs mit kilógnia. Azt viszont igen, hogy a rács
       megkapja az osztályt, amire a szabály épül (index.css: .todo-grid).
       Enélkül húzás közben fél pixelen megjelenik a vízszintes gördítősáv, és a
       hiba NÉMA lenne: az osztály eltűnése semmit nem törne el látványosan. */
    it("a rács megkapja a vízszintes levágást vezérlő osztályt", async () => {
        renderRead();
        await screen.findByText("Alma");
        const grid = document.querySelector(".todo-grid");
        expect(grid).toBeInTheDocument();
        // Ugyanazon a dobozon kell lennie, amiben a kártyák ülnek.
        expect(grid.querySelectorAll("[aria-roledescription]").length).toBe(3);
    });
});
