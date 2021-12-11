import React, { Component, Fragment } from "react";

import Post from "../../components/Feed/Post/Post";
import Button from "../../components/Button/Button";
import FeedEdit from "../../components/Feed/FeedEdit/FeedEdit";
import Input from "../../components/Form/Input/Input";
import Paginator from "../../components/Paginator/Paginator";
import Loader from "../../components/Loader/Loader";
import ErrorHandler from "../../components/ErrorHandler/ErrorHandler";
import "./Feed.css";

// const HOST = "http://localhost:8080"
const HOST = "https://message-graphql.herokuapp.com"

class Feed extends Component {
  state = {
    isEditing: false,
    posts: [],
    totalPosts: 0,
    editPost: null,
    status: "",
    postPage: 1,
    postsLoading: true,
    editLoading: false,
  };

  componentDidMount() {
    const graphqlQuery = {
      query: `
        query FetchStatus {
          getStatus {
            status
          }
        }
      `,
    };

    fetch(HOST + "/graphql", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + this.props.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(graphqlQuery),
    })
      .then((res) => {
        if (res.status !== 200) {
          throw new Error("Failed to fetch user status.");
        }
        return res.json();
      })
      .then((resData) => {
        console.log(resData);
        this.setState({ status: resData.data.getStatus.status });
      })
      .catch(this.catchError);

    this.loadPosts();
  }

  loadPosts = (direction) => {
    if (direction) {
      this.setState({ postsLoading: true, posts: [] });
    }
    let page = this.state.postPage;
    if (direction === "next") {
      page++;
      this.setState({ postPage: page });
    }
    if (direction === "previous") {
      page--;
      this.setState({ postPage: page });
    }

    const graphqlQuery = {
      query: `
        query FetchPost ($page: Int){
          getPosts(page: $page){
            posts {
              _id
              creator {
                name
              }
              title
              content
              createdAt
              imageUrl
            }
            totalItems
          }
        }
      `,
      variables: {
        page: page,
      },
    };

    fetch(HOST + "/graphql", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + this.props.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(graphqlQuery),
    })
      .then((res) => {
        return res.json();
      })
      .then((resData) => {
        if (resData.errors) {
          throw new Error("Fetching posts failed");
        }
        this.setState({
          posts: resData.data.getPosts.posts.map((post) => {
            const data = {
              ...post,
              imagePath: post.imageUrl,
            };
            return data;
          }),
          totalPosts: resData.data.getPosts.totalItems,
          postsLoading: false,
        });
      })
      .catch(this.catchError);
  };

  statusUpdateHandler = (event) => {
    event.preventDefault();
    const graphqlQuery = {
      query: `
        mutation UserStatusUpdate ($status: String!) {
          updateStatus(newStatus: $status) {
            status
          }
        }
      `,
      variables: {
        status: this.state.status,
      },
    };
    fetch(HOST + "/graphql", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + this.props.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(graphqlQuery),
    })
      .then((res) => {
        if (res.status !== 200 && res.status !== 201) {
          throw new Error("Can't update status!");
        }
        return res.json();
      })
      .then((resData) => {
        console.log(resData);
        this.componentDidMount();
      })
      .catch(this.catchError);
  };

  newPostHandler = () => {
    this.setState({ isEditing: true });
  };

  startEditPostHandler = (postId) => {
    this.setState((prevState) => {
      const loadedPost = { ...prevState.posts.find((p) => p._id === postId) };

      return {
        isEditing: true,
        editPost: loadedPost,
      };
    });
  };

  cancelEditHandler = () => {
    this.setState({ isEditing: false, editPost: null });
  };

  finishEditHandler = (postData) => {
    this.setState({
      editLoading: true,
    });

    const formData = new FormData();
    formData.append("image", postData.image);

    const url = HOST + "/upload-image";
    if (this.state.editPost) {
      formData.append("oldImage", this.state.editPost.imageUrl);
    }

    fetch(url, {
      method: "PUT",
      body: formData,
      headers: {
        Authorization: "Bearer " + this.props.token,
      },
    })
      .then((res) => {
        if (res.status === 422) {
          throw new Error(
            "No image uploaded or Attached file is not an image (jpeg/jpg/png)"
          );
        }
        return res.json();
      })
      .then((resData) => {
        const title = postData.title;
        const content = postData.content;
        const image = resData.filePath;

        let graphqlQuery = {
          query: `
            mutation CreateNewPost ($title: String!, $content: String!, $imageUrl: String! ) {
              createPost(postInput: { title: $title, content: $content, imageUrl: $imageUrl }) {
                _id
                title
                content
                imageUrl
                creator {
                  name
                }
                createdAt
              }
            }
          `,
          variables: {
            title: title,
            content: content,
            imageUrl: image,
          },
        };

        if (this.state.editPost) {
          const postId = this.state.editPost._id;
          graphqlQuery = {
            query: `
              mutation UpdatePost ($postId: ID!, $title: String!, $content: String!, $imageUrl: String!) {
                updatePost(_id: $postId, postInput: { title: $title, content: $content, imageUrl: $imageUrl }) {
                  _id
                  title
                  content
                  imageUrl
                  creator {
                    name
                  }
                  createdAt
                }
              }
            `,
            variables: {
              postId: postId,
              title: title,
              content: content,
              imageUrl: image,
            },
          };
        }
        return fetch(HOST + "/graphql", {
          method: "POST",
          body: JSON.stringify(graphqlQuery),
          headers: {
            Authorization: "Bearer " + this.props.token,
            "Content-Type": "application/json",
          },
        });
      })
      .then((res) => {
        return res.json();
      })
      .then((resData) => {
        if (resData.errors && resData.errors[0].status === 422) {
          throw new Error("Validation failed. Make sure your input is correct");
        }

        if (resData.errors) {
          if (this.state.editPost) {
            if (resData.errors[0].status === 403) {
              throw new Error("Not authorized for editing");
            }
            throw new Error("Post editing failed");
          } else {
            throw new Error("Post creation failed");
          }
        }
        let mutation = "createPost";

        if (this.state.editPost) {
          mutation = "updatePost";
        }

        const post = {
          _id: resData.data[mutation]._id,
          title: resData.data[mutation].title,
          content: resData.data[mutation].content,
          creator: resData.data[mutation].creator,
          createdAt: resData.data[mutation].createdAt,
          imageUrl: resData.data[mutation].imageUrl,
        };
        this.setState((prevState) => {
          let updatedPosts = [...prevState.posts];
          let updatedTotalPosts = prevState.totalPosts;
          if (prevState.editPost) {
            const postIndex = prevState.posts.findIndex(
              (p) => p._id === prevState.editPost._id
            );
            updatedPosts[postIndex] = post;
          } else {
            updatedTotalPosts++;
            if (prevState.posts.length >= 2) {
              updatedPosts.pop();
            }
            updatedPosts.unshift(post);
          }
          return {
            posts: updatedPosts,
            isEditing: false,
            editPost: null,
            editLoading: false,
            totalPosts: updatedTotalPosts,
          };
        });
      })
      .catch((err) => {
        console.log(err);
        this.setState({
          isEditing: false,
          editPost: null,
          editLoading: false,
          error: err,
        });
      });
  };

  statusInputChangeHandler = (input, value) => {
    this.setState({ status: value });
  };

  deletePostHandler = (postId) => {
    this.setState({ postsLoading: true });
    const graphqlQuery = {
      query: `
        mutation DeletePost ($postId: ID!) {
          deletePost(_id: $postId) 
        }
      `,
      variables: {
        postId: postId,
      },
    };
    fetch(HOST + "/graphql", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + this.props.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(graphqlQuery),
    })
      .then((res) => {
        // if (res.status !== 200 && res.status !== 201) {
        //   if (res.status === 403) {
        //     throw new Error("Not authorized for deleting");
        //   }
        //   throw new Error("Deleting a post failed!");
        // }
        return res.json();
      })
      .then((resData) => {
        console.log(resData);
        if (resData.errors) {
          if (resData.errors[0].status === 403) {
            throw new Error("Not authorized for deleting");
          }
          throw new Error("eleting a post failed");
        }
        this.loadPosts();
        // this.setState((prevState) => {
        //   const updatedPosts = prevState.posts.filter((p) => p._id !== postId);
        //   return { posts: updatedPosts, postsLoading: false };
        // });
      })
      .catch((err) => {
        console.log(err);
        this.setState({ postsLoading: false, error: err });
      });
  };

  errorHandler = () => {
    this.setState({ error: null });
  };

  catchError = (error) => {
    this.setState({ error: error });
  };

  render() {
    return (
      <Fragment>
        <ErrorHandler error={this.state.error} onHandle={this.errorHandler} />
        <FeedEdit
          editing={this.state.isEditing}
          selectedPost={this.state.editPost}
          loading={this.state.editLoading}
          onCancelEdit={this.cancelEditHandler}
          onFinishEdit={this.finishEditHandler}
        />
        <section className="feed__status">
          <form onSubmit={this.statusUpdateHandler}>
            <Input
              type="text"
              placeholder="Your status"
              control="input"
              onChange={this.statusInputChangeHandler}
              value={this.state.status}
            />
            <Button mode="flat" type="submit">
              Update
            </Button>
          </form>
        </section>
        <section className="feed__control">
          <Button mode="raised" design="accent" onClick={this.newPostHandler}>
            New Post
          </Button>
        </section>
        <section className="feed">
          {this.state.postsLoading && (
            <div style={{ textAlign: "center", marginTop: "2rem" }}>
              <Loader />
            </div>
          )}
          {this.state.posts.length <= 0 && !this.state.postsLoading ? (
            <p style={{ textAlign: "center" }}>No posts found.</p>
          ) : null}
          {!this.state.postsLoading && (
            <Paginator
              onPrevious={this.loadPosts.bind(this, "previous")}
              onNext={this.loadPosts.bind(this, "next")}
              lastPage={Math.ceil(this.state.totalPosts / 2)}
              currentPage={this.state.postPage}
            >
              {this.state.posts.map((post) => (
                <Post
                  key={post._id}
                  id={post._id}
                  author={post.creator.name}
                  date={new Date(post.createdAt).toLocaleDateString("en-US")}
                  title={post.title}
                  image={post.imageUrl}
                  content={post.content}
                  onStartEdit={this.startEditPostHandler.bind(this, post._id)}
                  onDelete={this.deletePostHandler.bind(this, post._id)}
                />
              ))}
            </Paginator>
          )}
        </section>
      </Fragment>
    );
  }
}

export default Feed;
