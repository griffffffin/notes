import {useCallback, useEffect, useState} from "react";
import {useNavigate} from "react-router-dom";
import InputGroup from "./Form/Input/inputGroup";
import SubmitButtonGroup from "../Button/submitButtonGroup";
import {useAuth} from "../../contexts/auth";

export default function Entry(props) {
    const [isLoginError, setIsLoginError] = useState(false);
    const [isSignUpError, setIsSignUpError] = useState(false);
    const [name, setName] = useState("");
    const [isNameValid, setIsNameValid] = useState(false);
    const [password, setPassword] = useState("");
    const [isPasswordValid, setIsPasswordValid] = useState(false);
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [passwordConfirm, setPasswordConfirm] = useState("");
    const [isPasswordConfirmValid, setIsPasswordConfirmValid] = useState(false);
    const [isDisabled, setIsDisabled] = useState(true);
    const {login, handleAxios} = useAuth();
    const navigate = useNavigate();
    // A props-ból csak az isLogin kell — a hookok függőségeiben ezt adjuk meg,
    // ne a teljes props objektumot (az minden rendernél új, a memózás így
    // hatástalan lenne).
    const {isLogin} = props;

    /* url és mb NEM state: a propból, illetve a hiba-állapotból egyértelműen
       adódnak. Korábban egy useEffect másolta őket state-be — ugyanaz a minta,
       ami a Save-ben a /update → /create váltást elrontotta: a másolat egy
       renderrel a prop mögött járt. Itt ráadásul az egész isLoading + Spinner
       csak azért létezett, hogy ezt az effektet megvárja; származtatva nincs
       mire várni, tehát az is elhagyható. */
    const url = isLogin ? "/login" : "/user/create";

    /* A jelszómező alatti térköz: hibaüzenetkor összébb húzódik, hogy a piros
       felirat elférjen. (A régi kód a beírás-kezelőkből mindig "mb-5"-öt tett
       ide, a signup induló "mb-3"-a helyett is — az első leütésre megugrott a
       lap. Származtatva ez a féloldalasság nem tud előfordulni.) */
    const mb = (isLoginError || isSignUpError) ? "mb-4" : (isLogin ? "mb-5" : "mb-3");

    const clearError = useCallback(() => {
        setIsLoginError(false);
        setIsSignUpError(false);
    }, []);

    const handleNameChange = useCallback((event) => {
        if (isLoginError || isSignUpError) clearError();
        setName(event.target.value);
        event.target.value.length ? setIsNameValid(true) : setIsNameValid(false);
    }, [isLoginError, isSignUpError, clearError]);

    const handlePasswordChange = useCallback((event) => {
        if (isLoginError || isSignUpError) clearError();
        setPassword(event.target.value);
        if (isLogin) event.target.value.length >= 8 ? setIsPasswordValid(true) : setIsPasswordValid(false);
        else {
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]{8,}$/.test(event.target.value) ?
                setIsPasswordValid(true) : setIsPasswordValid(false);
            (event.target.value === passwordConfirm) ?
                setIsPasswordConfirmValid(true) : setIsPasswordConfirmValid(false);
        }
    }, [isLoginError, isSignUpError, clearError, isLogin, passwordConfirm]);

    const handlePasswordConfirmChange = useCallback((event) => {
        if (isLoginError || isSignUpError) clearError();
        setPasswordConfirm(event.target.value);
        (event.target.value === password) ?
            setIsPasswordConfirmValid(true) : setIsPasswordConfirmValid(false);
    }, [isLoginError, isSignUpError, clearError, password]);

    const handleEyeClick = useCallback(() => setIsPasswordVisible(!isPasswordVisible), [isPasswordVisible]);

    useEffect(() => isLogin ? setIsDisabled(!(isNameValid && isPasswordValid)) :
            setIsDisabled(!(isNameValid && isPasswordValid && isPasswordConfirmValid)),
        [isLogin, isNameValid, isPasswordValid, isPasswordConfirmValid]);

    const handleSubmit = useCallback((event) => {
        event.preventDefault();
        handleAxios(url, {name: name, password: password}, (response) => {
                // A süti beállítása átbillenti az isLoggedIn-t, és a router magától
                // a to-do listára vált — nem kell teljes oldal-újratöltés.
                login(response.data);
                /* A tartalom magától cserélődik, de a CÍMSOR nem: a belépett
                   route-tábla "*" ága a /signup-ra is illeszkedik, így a lista a
                   /signup címen jelenne meg. A replace azért kell, hogy a Vissza
                   gomb ne a belépőre dobjon vissza egy már belépett usert. */
                navigate("/", {replace: true});
            }, (error) => {
                console.log(error.response?.data ?? error.message);
                /* A döntés STÁTUSZKÓDON áll, nem a hibaüzenet szövegén: a 409
                   (Conflict) a szerver szerződéses válasza a névütközésre.
                   Korábban a "foglalt" szóra kerestünk rá az üzenetben — az
                   üzenet átfogalmazása vagy fordítása némán elrontotta volna ezt
                   az ágat, és semmi nem jelezte volna. */
                if (isLogin) {
                    setIsLoginError(true);
                } else if (error.response?.status === 409) {
                    setIsSignUpError(true);
                }
            }
        );
    }, [isLogin, url, name, password, login, handleAxios, navigate]);

    return (
        <div className="container-fluid d-flex justify-content-center align-items-center mt-4 pt-2 px-0">
            <form className={"col-10 col-sm-6 col-md-5 col-xl-3 text-theme-text"}
                  onSubmit={handleSubmit}>
                <InputGroup isLogin={isLogin} mb={mb} handleClick={handleEyeClick}
                            name={name} handleNameChange={handleNameChange}
                            isPasswordVisible={isPasswordVisible}
                            password={password} handlePasswordChange={handlePasswordChange}
                            passwordConfirm={passwordConfirm}
                            handlePasswordConfirmChange={handlePasswordConfirmChange}
                            isSignUpError={isSignUpError} isLoginError={isLoginError}/>
                {/* A jelszó-ürítés a linkről elmaradhat: a routes.jsx külön key-t
                    ad a két nézetnek, így a váltás új példányt hoz, üres mezőkkel. */}
                <SubmitButtonGroup isDisabled={isDisabled} isLogin={isLogin}/>
            </form>
        </div>
    );
}
