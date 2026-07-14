import {useCallback, useEffect, useState} from "react";
import Spinner from "../spinner";
import InputGroup from "./Form/Input/inputGroup";
import SubmitButtonGroup from "../Button/submitButtonGroup";
import {useAuth} from "../../contexts/auth";

export default function Entry(props) {
    const [isLoading, setIsLoading] = useState(true);
    const [isLoginError, setIsLoginError] = useState(false);
    const [isSignUpError, setIsSignUpError] = useState(false);
    const [mb, setMb] = useState("");
    const [url, setUrl] = useState("");
    const [name, setName] = useState("");
    const [isNameValid, setIsNameValid] = useState(false);
    const [password, setPassword] = useState("");
    const [isPasswordValid, setIsPasswordValid] = useState(false);
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [passwordConfirm, setPasswordConfirm] = useState("");
    const [isPasswordConfirmValid, setIsPasswordConfirmValid] = useState(false);
    const [isDisabled, setIsDisabled] = useState(true);
    const {login, handleAxios} = useAuth();

    const clearError = useCallback((mb) => {
        setIsLoginError(false);
        setIsSignUpError(false);
        setMb("mb-" + mb);
    }, []);

    useEffect(() => {
        if (props.isLogin) {
            setUrl("/login");
            clearError(5);
        } else {
            setUrl("/user/create");
            clearError(3);
        }
    }, [props.isLogin, clearError]);

    const handleNameChange = useCallback((event) => {
        if (isLoginError || isSignUpError) clearError(5);
        setName(event.target.value);
        event.target.value.length ? setIsNameValid(true) : setIsNameValid(false);
    }, [isLoginError, isSignUpError, clearError]);

    const handlePasswordChange = useCallback((event) => {
        if (isLoginError || isSignUpError) clearError(5);
        setPassword(event.target.value);
        if (props.isLogin) event.target.value.length >= 8 ? setIsPasswordValid(true) : setIsPasswordValid(false);
        else {
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]{8,}$/.test(event.target.value) ?
                setIsPasswordValid(true) : setIsPasswordValid(false);
            (event.target.value === passwordConfirm) ?
                setIsPasswordConfirmValid(true) : setIsPasswordConfirmValid(false);
        }
    }, [isLoginError, isSignUpError, clearError, props.isLogin, passwordConfirm]);

    const handlePasswordConfirmChange = useCallback((event) => {
        if (isLoginError || isSignUpError) clearError(5);
        setPasswordConfirm(event.target.value);
        (event.target.value === password) ?
            setIsPasswordConfirmValid(true) : setIsPasswordConfirmValid(false);
    }, [isLoginError, isSignUpError, clearError, password]);

    const handleEyeClick = useCallback(() => setIsPasswordVisible(!isPasswordVisible), [isPasswordVisible]);

    useEffect(() => props.isLogin ? setIsDisabled(!(isNameValid && isPasswordValid)) :
            setIsDisabled(!(isNameValid && isPasswordValid && isPasswordConfirmValid)),
        [props.isLogin, isNameValid, isPasswordValid, isPasswordConfirmValid]);

    const handleSubmit = useCallback((event) => {
        event.preventDefault();
        handleAxios(url, {name: name, password: password}, (response) => {
                // A süti beállítása átbillenti az isLoggedIn-t, és a router magától
                // a to-do listára vált — nem kell teljes oldal-újratöltés.
                login(response.data);
            }, (error) => {
                console.log(error.response?.data ?? error.message);
                if (props.isLogin) {
                    setIsLoginError(true);
                    setMb("mb-4");
                } else if (error.response?.data?.includes("foglalt")) {
                    setIsSignUpError(true);
                    setMb("mb-4");
                }
            }
        );
    }, [props, url, name, password, login, handleAxios]);

    const clearPassword = useCallback(() => {
        setPassword("");
        setIsPasswordValid(false);
        setPasswordConfirm("");
        setIsPasswordConfirmValid(false);
    }, []);

    useEffect(() => {
        if (props && mb && url) setIsLoading(false);
    }, [props, mb, url]);

    return (
        isLoading ? <Spinner class="min-vh-75"/> :
            <div className="container-fluid d-flex justify-content-center align-items-center mt-4 pt-2 px-0">
                <form className={"col-10 col-sm-6 col-md-5 col-xl-3 text-theme-text"}
                      onSubmit={handleSubmit}>
                    <InputGroup isLogin={props.isLogin} mb={mb} handleClick={handleEyeClick}
                                name={name} handleNameChange={handleNameChange}
                                isPasswordVisible={isPasswordVisible}
                                password={password} handlePasswordChange={handlePasswordChange}
                                passwordConfirm={passwordConfirm}
                                handlePasswordConfirmChange={handlePasswordConfirmChange}
                                isSignUpError={isSignUpError} isLoginError={isLoginError}/>
                    <SubmitButtonGroup onClick={clearPassword} isDisabled={isDisabled}
                                       isLogin={props.isLogin}/>
                </form>
            </div>
    );
}
