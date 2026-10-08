import { feedbackAgent } from "../agents/feedback.agent.js";
import { interviewAgent } from "../agents/interview.agent.js";
import { summaryAgent } from "../agents/summary.agent.js";



export async function interviewNode(state) {
    const questions = await interviewAgent({
        role:state.role,
        type:state.type,
        useResume:state.useResume,
        resume:state.resume

    })

    return {
        questions
    }

}

export async function feedbackNode(state) {
    const feedback = await feedbackAgent({
        question: state.question,

        answer: state.answer,

        difficulty: state.difficulty,

    })

    return {
        feedback
    }
}


export async function summaryNode(state) {
    // The controller passes the questions as they were stored BEFORE this run,
    // so the last question has the candidate's answer but not yet the feedback
    // that feedbackNode just produced. Attach it here, otherwise the summary
    // sees the final answer with every score at 0.
    const questions = (state.questions || []).map((q) => {
        const plain = typeof q?.toObject === "function" ? q.toObject() : { ...q };
        return {
            question: plain.question,
            difficulty: plain.difficulty,
            userAnswer: plain.userAnswer,
            feedback: plain.feedback,
        };
    });

    if (questions.length > 0 && state.feedback) {
        questions[questions.length - 1].feedback = state.feedback;
    }

    const report = await summaryAgent({
         role: state.role,

        type: state.type,

        questions,
    })

    return {
        report
    }
}
