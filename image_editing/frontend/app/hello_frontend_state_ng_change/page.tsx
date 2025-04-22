'use client'

import axios from 'axios'
import { useEffect, useState } from 'react'


function MyButton() {
    const [count, setCount] = useState(0)

    function handleClick() {
        setCount(count + 1)
    }

    return (
        <button
            onClick={handleClick}>
            {count}
        </button >
    )
}

export default function Page() {
    const [data, setData] = useState({ message: '初期値' })

    // useEffect(() => {
    function fetchData() {
        axios.get('http://192.168.1.17:8001/api/image-editing/resize/')
            .then((res) => {
                console.log(res.data)
                setData(res.data)
            })
            .catch((err) => {
                console.error('Fetch error:', err)
            })
    }
    // }, [])



    return (
        <>
            hello{data.message}
            <br />
            <button onClick={fetchData}>Fetch Data</button>
            {/* <MyButton /> */}
        </>
    )
}