import api from "../utils/axios"
import { apiErrorMessage } from "../utils/apiError"


// Returns the server's JSON, or { success: false, message, status } on error,
// so callers can show the real reason (e.g. not enough coins).
const failure = (error) => ({
    success: false,
    status: error?.response?.status,
    message: apiErrorMessage(error),
    interviewCoin: error?.response?.data?.interviewCoin,
})

export const startInterview = async (data) => {
    try {
        const response = await api.post("/api/interview/start" , data)
        return response.data
    } catch (error) {
        console.log(error)
        return failure(error)
    }
}

export const getInterview = async (id) => {
    try {
        const response = await api.get(`/api/interview/${id}`)
        console.log(response.data)
        return response.data
    } catch (error) {
        console.log(error)
        return null
    }
}


export const submitAnswer = async (data) => {
     try {
        const response = await api.post(`/api/interview/answer` , data)
       
        return response.data
    } catch (error) {
        console.log(error)
        return failure(error)
    }
}

export const getAllInterviews = async () => {
     try {
        const response = await api.get(`/api/interview/all`)
        console.log(response.data)
        return response.data
    } catch (error) {
        console.log(error)
        return null
    }
}