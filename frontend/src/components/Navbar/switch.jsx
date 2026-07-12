import ReactSwitch from "react-switch";
import {useTheme} from "../../contexts/theme";
/* A nap/hold ikon 2x retina-méretre kicsinyítve és tömörítve (19,7 kB → 3,0 kB,
   14,5 kB → 1,4 kB) — így a Vite 4 kB-os beágyazási küszöbe alá kerültek, tehát
   a bundle részei: nincs külön letöltés, nem villannak be későn, és nem kell
   hozzájuk <link rel="preload"> az index.html-ben. */
import sun from "../../assets/icons/switch/sun.png";
import moon from "../../assets/icons/switch/moon.png";

export default function Switch() {
    const {colorHex, isChecked, handleCheckedChange} = useTheme();

    return (
        <ReactSwitch checked={isChecked} onChange={handleCheckedChange} boxShadow={"0 0 2px 2px " + colorHex}
                     activeBoxShadow={"0 0 2px 2px " + colorHex} onColor="#c11d31" offColor="#213e90"
                     checkedIcon={<div className="h-100 d-flex justify-content-center align-items-center">
                         <img className="h-100" alt="" src={sun}/>
                     </div>}
                     uncheckedIcon={<div className="h-100 d-flex justify-content-center align-items-center">
                         <img className="h-75" alt="" src={moon}/>
                     </div>}/>
    );
}
