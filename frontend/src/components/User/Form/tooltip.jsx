import {Tooltip as ReactTooltip} from "react-tooltip";
import {useTheme} from "../../../contexts/theme";

export default function Tooltip() {
    const {color, colorHex, backgroundColor} = useTheme();

    return (<>
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="currentColor" tabIndex="-1"
             className={"bi bi-info-circle no-focus mb-1 text-" + color} data-tooltip-id="tooltip"
             viewBox="0 0 16 16">
            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
            <path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808
            1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93
            6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/>
        </svg>
        <ReactTooltip id="tooltip" place="bottom" clickable={true}
                      border={"1px solid " + colorHex}
                      style={{backgroundColor: backgroundColor, color: colorHex, zIndex: 10}}>
            A jelszó legalább <br/>8 karakter legyen.<br/>Kis-, nagybetűkből <br/>és számokból álljon.
        </ReactTooltip>
    </>);
}
