import React from 'react'
import { FiDownload } from 'react-icons/fi'
import { useReactToPrint } from "react-to-print";
import { spendCoins } from '../../apis/user.api';
import { apiErrorMessage } from '../../utils/apiError';
function DownloadBtn({ docRef, user, setUser }) {

    const handlePdf = useReactToPrint({
        contentRef: docRef,
        documentTitle: "HirePilotPDF"
    })

    const handleDownload = async () => {
        try {
            
                // The price is set on the server; only the action name is sent.
                const coinResponse = await spendCoins({ action: "download-pdf" })

                await handlePdf()
                setUser((prev) => ({
                    ...prev, interviewCoin: coinResponse?.interviewCoin,
                }))
            
          

        } catch (error) {
            alert(apiErrorMessage(error));



        }


    }
    return (
        <button onClick={handleDownload} className='flex items-center gap-2 rounded-lg bg-black px-3 py-2 text-xs text-white'>
            <FiDownload />
            Download PDF

        </button>
    )
}

export default DownloadBtn
