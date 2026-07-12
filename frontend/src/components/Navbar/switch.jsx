import ReactSwitch from "react-switch";

/* A nap/hold ikon a public/ mappából jön, stabil (nem hash-elt) útvonalon — így
   az index.html előre be tudja tölteni őket. Importálva a Vite külön, hash-elt
   fájlt csinálna belőlük (a 4 KB-os beágyazási küszöb fölött vannak), amit a
   böngésző csak a kapcsoló kirajzolásakor kezdene letölteni: az ikonok
   késve, ugrálva jelennének meg. */
const SUN = "/icons/sun.png";
const MOON = "/icons/moon.png";

export default function Switch(props) {
    return (
        <ReactSwitch checked={props.isChecked} onChange={props.onChange} boxShadow={"0 0 2px 2px " + props.color}
                     activeBoxShadow={"0 0 2px 2px " + props.color} onColor="#c11d31" offColor="#213e90"
                     checkedIcon={<div className="h-100 d-flex justify-content-center align-items-center">
                         <img className="h-100" alt="" src={SUN}/>
                     </div>}
                     uncheckedIcon={<div className="h-100 d-flex justify-content-center align-items-center">
                         <img className="h-75" alt="" src={MOON}/>
                     </div>}/>
    );
}
