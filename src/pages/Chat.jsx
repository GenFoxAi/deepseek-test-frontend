import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { CgAttachment } from "react-icons/cg";
import userImage from "../assets/profile-test.jpg";
import botImage from "../assets/logo-5.png";
import SupportModel from "../components/model/SupportModel";
import { AiOutlineDislike, AiOutlineLike } from "react-icons/ai";
import { BiCopyAlt } from "react-icons/bi";
import { TbReload } from "react-icons/tb";
import { MdOutlineSupportAgent } from "react-icons/md";
import SlideInNotifications from "../components/SlideInNotifications";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import LeaveRequestModal from "../components/model/LeaveRequestModal";
import ReimbursementModal from "../components/model/ReimbursementModal";
import Loader from "../components/loader/Loader";
import { useLeaveRequests } from "../contexts/LeaveRequestContext";
import { useReimbursements } from "../contexts/ReimbursementContext";
import MarkdownIt from "markdown-it";
import hljs from "highlight.js";
import "highlight.js/styles/github.css";

const Chat = () => {
  const location = useLocation();
  const initialMessage = location.state?.initialMessage || "";
  const { addLeaveRequest } = useLeaveRequests();
  const { addReimbursement } = useReimbursements();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const md = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
    highlight: function (str, lang) {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return `<pre class="hljs"><code>${
            hljs.highlight(str, { language: lang, ignoreIllegals: true }).value
          }</code></pre>`;
        } catch (__) {}
      }

      return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`;
    },
  });

  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState({
    userQuestion: "",
    botReply: "",
  });
  const [notifications, setNotifications] = useState([]);
  const hasInitialMessageBeenSent = useRef(false);

  const [isLoading, setIsLoading] = useState(false);

  const [typedMessageIndices, setTypedMessageIndices] = useState(new Set());

  const [threadId] = useState(uuidv4());

  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [reimbursementModalOpen, setReimbursementModalOpen] = useState(false);

  const addNotification = (text) => {
    const newNotification = {
      id: uuidv4(),
      text,
    };
    setNotifications((prev) => [newNotification, ...prev]);
  };

  const removeNotif = (id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const handleLeaveRequestSubmit = (leaveData) => {
    addLeaveRequest(leaveData);

    const confirmationMessage = {
      role: "assistant",
      content: `✅ **Leave Application Submitted!**

**Details:**
- **Leave Type:** ${leaveData.leaveType}
- **Reason:** ${leaveData.reason}
- **Dates:** ${leaveData.startDate} to ${leaveData.endDate}
- **Status:** ${leaveData.status}`,
    };

    setMessages((prev) => [...prev, confirmationMessage]);
    setLeaveModalOpen(false);
  };

  const handleReimbursementSubmit = (reimbursementData) => {
    addReimbursement(reimbursementData);

    const BASIC_SALARY = 5000;
    const TOTAL_SALARY = 5000 + parseInt(reimbursementData.expenseAmount, 10);
    const confirmationMessage = {
      role: "assistant",
      content: `✅ **Reimbursement Submitted Successfully!**

**Details:**
- **Expense Type:** ${reimbursementData.expenseType}
- **Reason:** ${reimbursementData.description}
- **Amount:** ${reimbursementData.expenseAmount} SAR
- **Date:** ${reimbursementData.expenseDate}
- **Mode of Payment:** ${reimbursementData.modeOfPayment}
- **Status:** ${reimbursementData.status}

Once approved, your salary next month will be **${TOTAL_SALARY} SAR**, including your basic salary ${BASIC_SALARY} SAR and the reimbursed amount ${reimbursementData.expenseAmount} SAR.`,
    };

    setMessages((prev) => [...prev, confirmationMessage]);
    setReimbursementModalOpen(false);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const focusInput = () => {
    inputRef.current?.focus();
  };

  useEffect(() => {
    focusInput();
  }, []);

  useEffect(() => {
    if (initialMessage && !hasInitialMessageBeenSent.current) {
      handleSend(initialMessage);
      hasInitialMessageBeenSent.current = true;
    }
  }, [initialMessage]);

  const transformToBackendMessageFormat = (frontendMessages) => {
    return frontendMessages.map((message) => {
      if (typeof message === "object") {
        return {
          role: message.role,
          content: message.content,
          ...(message.documentUrl && {
            response_metadata: { documentUrl: message.documentUrl },
          }),
        };
      }
      return {
        role: "user",
        content: message,
      };
    });
  };

  const handleSend = async (inputMessage = null) => {
    const messageContent = inputMessage || input.trim();
    if (!messageContent) return;

    const userMessage = { role: "user", content: messageContent };
    setMessages((prev) => [...prev, userMessage]);

    if (!inputMessage) {
      setInput("");
    }

    setIsLoading(true);

    try {
      const response = await axios.post("http://localhost:8000/chat/", {
        thread_id: threadId,
        messages: transformToBackendMessageFormat([...messages, userMessage]),
      });

      const { messages: returnedMsgs, action } = response.data;

      const lastMessage = returnedMsgs[returnedMsgs.length - 1] || {};
      const parseMessage = (msg) => {
        if (typeof msg === "string") {
          const documentUrlMatch = msg.match(/\[Metadata: (.*?)\]/);
          return {
            content: documentUrlMatch ? msg.split("[")[0].trim() : msg,
            documentUrl: documentUrlMatch
              ? JSON.parse(documentUrlMatch[1]).documentUrl
              : null,
          };
        }
        return {
          content: msg.content || msg,
          documentUrl:
            msg.response_metadata?.documentUrl || msg.documentUrl || null,
        };
      };

      const parsed = parseMessage(lastMessage);
      const botMessage = {
        role: "assistant",
        content: parsed.content,
        documentUrl: parsed.documentUrl,
      };
      setMessages((prev) => [...prev, botMessage]);

      if (action === "open_leave_modal") {
        setLeaveModalOpen(true);
      } else if (action === "open_reimbursement_modal") {
        setReimbursementModalOpen(true);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      addNotification("❌ Error connecting to the server!");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFeedbackClick = (msg) => {
    if (msg.role !== "assistant") return;

    const userMsgIndex = messages.findIndex(
      (m, idx) => m.role === "user" && idx === msg.index * 2
    );
    const userQuestion = messages[userMsgIndex]?.content || "N/A";
    const botReply = msg.content;

    setSelectedMessage({ userQuestion, botReply });
    setIsSupportModalOpen(true);
  };

  const handleCopy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      addNotification("📋 Copied to clipboard!");
    } catch (err) {
      addNotification("❌ Failed to copy!");
    }
  };

  const handleReload = async (msgIndex) => {
    const userMsgIndex = msgIndex * 2;

    const userMessage = messages[userMsgIndex]?.content;
    if (!userMessage) {
      addNotification("❌ No user message found for reloading.");
      return;
    }

    setMessages((prev) => {
      const newMessages = [...prev];
      newMessages.splice(msgIndex * 2 + 1, 1);
      return newMessages;
    });

    setIsLoading(true);

    try {
      const conversationUpToUser = messages.slice(0, userMsgIndex + 1);

      const response = await axios.post("http://localhost:8000/chat/", {
        thread_id: threadId,
        messages: transformToBackendMessageFormat(conversationUpToUser),
      });

      const { messages: returnedMsgs, action } = response.data;
      const lastMessage = returnedMsgs[returnedMsgs.length - 1];

      const botMessage = {
        role: "assistant",
        content: lastMessage.content,
        documentUrl: lastMessage.response_metadata?.documentUrl || "",
      };

      setMessages((prev) => {
        const newMessages = [...prev];
        newMessages.splice(msgIndex * 2 + 1, 0, botMessage);
        return newMessages;
      });

      if (action === "open_leave_modal") {
        setLeaveModalOpen(true);
      } else if (action === "open_reimbursement_modal") {
        setReimbursementModalOpen(true);
      }

      addNotification("🔄 Bot response reloaded!");
    } catch (error) {
      console.error("Error reloading message:", error);
      addNotification("❌ Error connecting to the server!");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLike = (msgIndex) => {
    addNotification("👍 You liked this response!");
  };

  const handleQuestion = (msgIndex) => {
    addNotification("❓ Need more information?");
  };

  return (
    <>
      <LeaveRequestModal
        isOpen={leaveModalOpen}
        setIsOpen={setLeaveModalOpen}
        onSubmit={handleLeaveRequestSubmit}
      />
      <ReimbursementModal
        isOpen={reimbursementModalOpen}
        setIsOpen={setReimbursementModalOpen}
        onSubmit={handleReimbursementSubmit}
      />
      <div
        className="
          flex flex-col flex-grow 
          bg-black text-white relative 
          px-4 md:px-[20%] 
          transition-all duration-300
        "
      >
        <SupportModel
          isOpen={isSupportModalOpen}
          setIsOpen={setIsSupportModalOpen}
          userQuestion={selectedMessage.userQuestion}
          botReply={selectedMessage.botReply}
        />

        <SlideInNotifications
          notifications={notifications}
          removeNotif={removeNotif}
        />

        <div className="flex-grow overflow-y-auto px-6 py-4 pb-24">
          {messages.map((msg, idx) => {
            const msgIndex = Math.floor(idx / 2);

            return (
              <div
                key={idx}
                className={`flex my-2 ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`flex items-start w-full ${
                    msg.role === "user" ? "flex-row-reverse" : "flex-row"
                  }`}
                >
                  <div
                    className={`flex-shrink-0 ${
                      msg.role === "user" ? "ml-2" : "mr-2"
                    }`}
                  >
                    <img
                      src={msg.role === "user" ? userImage : botImage}
                      alt={msg.role === "user" ? "User" : "Comm-IT AI"}
                      className={`rounded-full object-cover ${
                        msg.role === "user"
                          ? "w-12 h-12"
                          : "bg-gray-900 w-12 h-12"
                      }`}
                    />
                  </div>

                  <div
                    className={`w-fit rounded-xl p-3 ${
                      msg.role === "user"
                        ? "bg-[#202327] text-left max-w-[85%]"
                        : "bg-black w-[85%]"
                    } break-words`}
                  >
                    <div className="text-[16px] break-words">
                      {msg.role === "assistant" ? (
                        msg.documentUrl ? (
                          <div>
                            <b>Document Ready for Download: </b>
                            <a
                              href={msg.documentUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-300 font-semibold"
                            >
                              Click here to download
                            </a>
                          </div>
                        ) : (
                          <div
                            className="markdown-content"
                            dangerouslySetInnerHTML={{
                              __html: md.render(
                                typeof msg.content === "string"
                                  ? msg.content
                                  : JSON.stringify(msg.content)
                              ),
                            }}
                          />
                        )
                      ) : (
                        <span>{msg.content}</span>
                      )}
                    </div>
                    {msg.role === "assistant" && (
                      <div className="flex items-center gap-3 mt-2 text-gray-400 text-md">
                        <AiOutlineLike
                          className="cursor-pointer"
                          onClick={() => handleLike(msgIndex)}
                        />
                        <AiOutlineDislike
                          className="cursor-pointer"
                          onClick={() =>
                            handleFeedbackClick({
                              ...msg,
                              index: msgIndex,
                            })
                          }
                        />
                        <BiCopyAlt
                          className="cursor-pointer"
                          onClick={() => handleCopy(msg.content)}
                        />
                        <MdOutlineSupportAgent
                          className="cursor-pointer"
                          onClick={() =>
                            handleFeedbackClick({
                              ...msg,
                              index: msgIndex,
                            })
                          }
                        />
                        <TbReload
                          className="cursor-pointer"
                          onClick={() => handleReload(msgIndex)}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex my-2 justify-start">
              <div className="flex items-start flex-row">
                <div className="mr-2 flex-shrink-0">
                  <img
                    src={botImage}
                    alt="Comm-IT AI"
                    className="bg-gray-900 rounded-full object-cover w-12 h-12"
                  />
                </div>

                <div className="bg-black w-[85%] rounded-xl p-3 break-words">
                  <Loader />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-opacity-90 bg-black transition-all duration-300">
        <div className="flex items-center max-w-full sm:max-w-2xl mx-auto w-full">
          <button
            className="bg-[#202327] px-4 py-4 rounded-l-full hover:bg-gray-600 flex items-center justify-center relative"
            aria-label="Attach file"
          >
            <CgAttachment className="text-white" />
            <input
              type="file"
              className="absolute inset-0 opacity-0 cursor-pointer"
              onChange={(e) => {
                const file = e.target.files[0];
                if (file) {
                  addNotification(`📎 File uploaded: ${file.name}`);
                  console.log("Uploaded file:", file);
                }
              }}
            />
          </button>

          <input
            type="text"
            placeholder="Ask anything..."
            className="
              flex-grow p-3 
              bg-[#202327] 
              text-white 
              outline-none 
              rounded-none 
              focus:ring-0
            "
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            ref={inputRef}
          />
          <button
            className="bg-[#202327] px-4 py-3 rounded-r-full hover:bg-gray-600 flex items-center justify-center"
            onClick={() => handleSend()}
            aria-label="Send message"
          >
            ➤
          </button>
        </div>
      </div>
    </>
  );
};

export default Chat;
