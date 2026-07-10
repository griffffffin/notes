/* Ideiglenes csonk: a valódi Routes (navbar + útvonalak) a következő portolási
   lépésekben kerül át a régi projektből. Addig csak jelzi, hogy az app-váz él. */
export default function Routes(props) {
    return (
        <div className="min-vh-75 row col align-items-center justify-content-center mx-auto">
            <p className={"caveat text-center text-" + props.color}>
                A portolás folyamatban — a navigáció és az oldalak hamarosan itt lesznek.
            </p>
        </div>
    );
}
