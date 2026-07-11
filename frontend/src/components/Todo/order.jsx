import {useCallback, useEffect, useState} from "react";
import {Tooltip as ReactTooltip} from "react-tooltip";

export default function Order(props) {
    const [plusDown, setPlusDown] = useState(false);
    const [minusDown, setMinusDown] = useState(false);

    const handleMinusDown = useCallback(() => setMinusDown(true), []);
    const handleMinusUp = useCallback(() => setMinusDown(false), []);
    const handlePlusDown = useCallback(() => setPlusDown(true), []);
    const handlePlusUp = useCallback(() => setPlusDown(false), []);

    useEffect(() => {
        if (!plusDown && minusDown && props.current > 1) setTimeout(() => props.setOrder(props.current - 1), 200);
    }, [plusDown, minusDown, props]);

    useEffect(() => {
        if (plusDown && !minusDown && props.last >= props.current) setTimeout(() =>
            props.setOrder(props.current + 1), 200);
    }, [plusDown, minusDown, props]);

    return (
        <div className={"card-header no-focus bg-transparent fs-4 user-select-none pe-2 text-" + props.color}>
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="currentColor"
                 className="bi bi-dash-circle me-1 pb-1" viewBox="0 0 16 16"
                 onMouseDown={handleMinusDown} onMouseUp={handleMinusUp}
                 onTouchStart={handleMinusDown} onTouchEnd={handleMinusUp}>
                <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                <path d="M4 8a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7A.5.5 0 0 1 4 8z"/>
            </svg>
            <span data-tooltip-id="tooltip">{props.current}</span>
            <ReactTooltip id="tooltip" className={"border-" + props.color} place="bottom" clickable={true}
                          border={"1px solid " + props.colorHex} style={{zIndex: 10}}>
                Sorszám
            </ReactTooltip>
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="currentColor"
                 className="bi bi-plus-circle ms-1 pb-1" viewBox="0 0 16 16"
                 onMouseDown={handlePlusDown} onMouseUp={handlePlusUp}
                 onTouchStart={handlePlusDown} onTouchEnd={handlePlusUp}>
                <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1
                        0-1h3v-3A.5.5 0 0 1 8 4z"/>
            </svg>
        </div>
    );
}
