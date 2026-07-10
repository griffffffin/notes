/* Ideiglenes csonk: a valódi Entry (login/regisztráció űrlap) a következő
   portolási lépésben kerül át a régi projektből. */
export default function Entry(props) {
    return (
        <div className="min-vh-75 row col align-items-center justify-content-center mx-auto">
            <p className={"caveat text-center text-" + props.color}>
                {props.isLogin ? "Bejelentkezés" : "Regisztráció"} — az űrlap portolása hamarosan.
            </p>
        </div>
    );
}
