import FilterLink from "./filterLink";

/* Egy szerző-hivatkozás az idézet-kártya láblécén — a to-do LinkCategory párja: a
   szerző szűrt nézetére visz (/quotes/:author). A link VÁZÁT (kódolás, szín,
   megjelenés) a közös FilterLink adja; itt csak az idézet-specifikus rész marad.

   ELTÉRÉS a kategória-párjától: NÉVTELEN idézetnek nincs lábléce. Az "Anonymous"
   jelölő CSAK az URL-ben létezik (a /quotes/Anonymous szűrő szegmenseként), a
   felületen sehol nem írjuk ki — így a kártya olyan, mint a publikus nézet:
   szerző csak akkor látszik, ha van. A to-do kategóriája ezzel szemben kötelező,
   ott nincs mit elrejteni. */
export default function LinkAuthor(props) {
    if (!props.author) return null;

    return <FilterLink to="/quotes/" value={props.author} onClick={props.onClick}
                       color={props.color} class={props.class}/>;
}
