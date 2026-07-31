import FilterLink from "./filterLink";

/* Egy kategória-hivatkozás. KÉT helyen jelenik meg: a to-do kártya láblécében ÉS
   a navbar kategória-legördülőjében. A link VÁZÁT (kódolás, szín, megjelenés) a
   közös FilterLink adja — ugyanaz, ami az idézetek szerző-hivatkozását is.

   A szűrő az URL-ben utazik (/to-do/category/:name): MELYIK kategóriát kérje le a
   lista. Így F5/direkt link után is áll — szemben a régi navigációs state-tel. */
export default function Category(props) {
    return <FilterLink to="/to-do/category/" value={props.category} onClick={props.onClick}
                       color={props.color} class={props.class}/>;
}
