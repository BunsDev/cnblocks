import { useState, useRef, useEffect, RefObject } from 'react'
import { isUrlCached } from '@/lib/serviceWorker' 

const getCacheKey = (src: string) => `iframe-cache-${src}`

interface UseOptimizedIframeProps {
    previewUrl: string
    containerRef: RefObject<HTMLElement | null> 
}

interface UseOptimizedIframeReturn {
    iframeRef: RefObject<HTMLIFrameElement | null>
    shouldLoadIframe: boolean
    currentIframeHeight: number
    isIframeCached: boolean
    setIframeHeightState: (height: number) => void 
}

export const useOptimizedIframe = ({
    previewUrl,
    containerRef,
}: UseOptimizedIframeProps): UseOptimizedIframeReturn => {
    const [iframeHeight, setIframeHeight] = useState(0)
    const [shouldLoadIframe, setShouldLoadIframe] = useState(false)
    const [cachedHeight, setCachedHeight] = useState<number | null>(null)
    const [isIframeCached, setIsIframeCached] = useState(false)

    const iframeRef = useRef<HTMLIFrameElement | null>(null)
    const observerRef = useRef<IntersectionObserver | null>(null)

    useEffect(() => {
        observerRef.current = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setShouldLoadIframe(true)
                    observerRef.current?.disconnect()
                }
            },
            { threshold: 0.1 }
        )

        if (containerRef.current) {
            observerRef.current.observe(containerRef.current)
        }

        return () => {
            observerRef.current?.disconnect()
        }
    }, [containerRef])

    useEffect(() => {
        const checkCache = async () => {
            try {
                const isCached = await isUrlCached(previewUrl)
                setIsIframeCached(isCached)
                if (isCached) {
                    setShouldLoadIframe(true) 
                }
            } catch (error) {
                console.error('Error checking service worker cache status:', error)
            }
        }

        checkCache()

        try {
            const cacheKey = getCacheKey(previewUrl)
            const cached = localStorage.getItem(cacheKey)
            if (cached) {
                const { height, timestamp } = JSON.parse(cached)
                const now = Date.now()
                if (now - timestamp < 24 * 60 * 60 * 1000) { 
                    setCachedHeight(height)
                    setIframeHeight(height) 
                } else {
                    localStorage.removeItem(cacheKey) 
                }
            }
        } catch (error) {
            console.error('Error retrieving iframe height from localStorage:', error)
        }
    }, [previewUrl])

    useEffect(() => {
        const iframe = iframeRef.current
        if (!iframe || !shouldLoadIframe) return

        const handleLoad = () => {
            try {
                if (iframe.contentWindow && iframe.contentWindow.document.body) {
                    const contentHeight = iframe.contentWindow.document.body.scrollHeight
                    setIframeHeight(contentHeight)
                    setCachedHeight(contentHeight) 

                    const cacheKey = getCacheKey(previewUrl)
                    const cacheValue = JSON.stringify({
                        height: contentHeight,
                        timestamp: Date.now(),
                    })
                    localStorage.setItem(cacheKey, cacheValue)
                }
            } catch (e) {
                console.warn('Error accessing iframe content for height calculation:', e)
            }
        }

        iframe.addEventListener('load', handleLoad)
        return () => {
            iframe.removeEventListener('load', handleLoad)
        }
    }, [shouldLoadIframe, previewUrl])

    useEffect(() => {
        if (!containerRef.current || shouldLoadIframe || isIframeCached) return

        const linkElement = document.createElement('link')
        linkElement.rel = 'preload'
        linkElement.href = previewUrl
        linkElement.as = 'document'

        if (!document.head.querySelector(`link[rel="preload"][href="${previewUrl}"]`)) {
            document.head.appendChild(linkElement)
        }

        return () => {
            const existingLink = document.head.querySelector(`link[rel="preload"][href="${previewUrl}"]`)
            if (existingLink) {
                document.head.removeChild(existingLink)
            }
        }
    }, [previewUrl, shouldLoadIframe, containerRef, isIframeCached])

    return {
        iframeRef,
        shouldLoadIframe,
        currentIframeHeight: cachedHeight || iframeHeight || 0, 
        isIframeCached,
        setIframeHeightState: setIframeHeight
    }
}
